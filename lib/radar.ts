import { completeJson } from './llm';
import { radarSystem, radarUser } from './prompts/radar';
import { radarSchema } from './schemas';
import { searchWeb, type SearchResult } from './search';

/**
 * Radar (PRD F2): find public gig postings, read them with the model and rank
 * them against this freelancer.
 *
 * The model only fills in the structured fields (budget, hours, requirements,
 * red flags). Title, URL and text always come from the search result, and a
 * URL the model made up is dropped, so every gig links to a real posting.
 */

export interface GigCandidate {
  title: string;
  url: string;
  snippet: string;
  /** Budget in cents, when the posting states one. */
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  budgetCurrency: string;
  estHours: number | null;
  requirements: string[];
  redFlags: string[];
}

export interface RadarGig extends GigCandidate {
  /** Share of the freelancer's skills the posting mentions (0..1). */
  fitScore: number;
  /** How the budget compares with the floor rate (0..1). */
  budgetScore: number;
  /** Rank score 0..100. */
  score: number;
  /** The hourly rate the budget implies, in cents. */
  impliedHourlyCents: number | null;
}

/** Points lost per red flag. */
const RED_FLAG_PENALTY: Record<string, number> = {
  vague_scope: 8,
  free_work: 20,
  no_budget: 10,
};

/**
 * Share of the freelancer's skills the posting mentions (0..1). A skill named
 * in the title counts fully, one that only shows up in the text counts half.
 */
export function skillFit(title: string, body: string, skills: string[]): number {
  if (skills.length === 0) return 0;
  const inTitle = title.toLowerCase();
  const inBody = body.toLowerCase();
  const total = skills.reduce((sum, skill) => {
    const words = skill
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1);
    if (words.some((word) => inTitle.includes(word))) return sum + 1;
    if (words.some((word) => inBody.includes(word))) return sum + 0.5;
    return sum;
  }, 0);
  return total / skills.length;
}

/**
 * Rank gigs by fit to the skills and by whether the budget clears the floor.
 * All of the math lives here, not in the model.
 */
export function rankGigs(
  candidates: GigCandidate[],
  skills: string[],
  minHourlyRateCents: number,
  currency: string,
): RadarGig[] {
  return candidates
    .map((candidate) => {
      const body = [candidate.snippet, ...candidate.requirements].join(' ');
      const fitScore = skillFit(candidate.title, body, skills);

      let budgetScore = 0;
      let impliedHourlyCents: number | null = null;
      const budget =
        candidate.budgetMaxCents ?? candidate.budgetMinCents ?? null;

      if (budget !== null) {
        if (candidate.budgetCurrency !== currency) {
          // Another currency cannot be compared without an exchange rate.
          budgetScore = 0.5;
        } else if (candidate.estHours && candidate.estHours > 0) {
          impliedHourlyCents = Math.round(budget / candidate.estHours);
          budgetScore =
            impliedHourlyCents >= minHourlyRateCents
              ? 1
              : minHourlyRateCents > 0
                ? impliedHourlyCents / minHourlyRateCents
                : 0;
        } else {
          // A budget but no hours to compare it against.
          budgetScore = 0.5;
        }
      }

      const penalty = candidate.redFlags.reduce(
        (sum, flag) => sum + (RED_FLAG_PENALTY[flag] ?? 5),
        0,
      );
      const score = Math.round(
        Math.min(100, Math.max(0, fitScore * 45 + budgetScore * 45 + 10 - penalty)),
      );

      return {
        ...candidate,
        fitScore: round2(fitScore),
        budgetScore: round2(budgetScore),
        score,
        impliedHourlyCents,
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Keep only the model output whose URL is one of the search results. The rest
 * is dropped: a gig without a real source link is not worth quoting.
 */
export function keepVerified(
  extracted: { title: string; url: string; est_hours: number | null; budget_min: number | null; budget_max: number | null; budget_currency: string; requirements: string[]; red_flags: string[] }[],
  searchResults: SearchResult[],
): GigCandidate[] {
  const byUrl = new Map(searchResults.map((result) => [result.url, result]));

  return extracted
    .map((item) => {
      const source = byUrl.get(item.url);
      if (!source) return null;
      return {
        title: source.title,
        url: source.url,
        snippet: source.content,
        budgetMinCents: item.budget_min === null ? null : Math.round(item.budget_min * 100),
        budgetMaxCents: item.budget_max === null ? null : Math.round(item.budget_max * 100),
        budgetCurrency: item.budget_currency.toUpperCase(),
        estHours: item.est_hours,
        requirements: item.requirements,
        redFlags: item.red_flags,
      } satisfies GigCandidate;
    })
    .filter((candidate): candidate is GigCandidate => candidate !== null);
}

/** Fallback when the model returned nothing usable: the raw postings. */
export function rawCandidates(results: SearchResult[]): GigCandidate[] {
  return results.map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.content,
    budgetMinCents: null,
    budgetMaxCents: null,
    budgetCurrency: 'USD',
    estHours: null,
    requirements: [],
    redFlags: [],
  }));
}

export interface RadarOutcome {
  query: string;
  gigs: RadarGig[];
  /** 'nebius' or 'offline'. */
  provider: string;
  /** 'tavily' or 'offline'. */
  searchProvider: string;
}

/** Real gig postings live on the marketplaces; rate pages live on blogs (Pricer searches domain-free). */
const MARKETPLACE_DOMAINS = ['upwork.com', 'fiverr.com', 'freelancer.com', 'guru.com'];

export async function runRadar(input: {
  query: string;
  skills: string[];
  minHourlyRateCents: number;
  currency: string;
}): Promise<RadarOutcome> {
  const search = await searchWeb(input.query, 10, MARKETPLACE_DOMAINS);

  const extraction = await completeJson({
    task: 'radar',
    tier: 'fast',
    schema: radarSchema,
    system: radarSystem,
    user: radarUser({ skills: input.skills, query: input.query, results: search.results }),
    offline: { skills: input.skills, query: input.query, results: search.results },
  });

  const verified = keepVerified(extraction.data.results, search.results);
  const candidates = verified.length > 0 ? verified : rawCandidates(search.results);

  return {
    query: input.query,
    gigs: rankGigs(candidates, input.skills, input.minHourlyRateCents, input.currency),
    provider: extraction.provider,
    searchProvider: search.provider,
  };
}
