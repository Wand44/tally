/**
 * Deterministic stand-in for the model.
 *
 * Used when no Nebius credentials are configured, so the product still works
 * (demo mode, offline dev, tests). It returns the same JSON contract as the
 * real model, so lib/llm.ts validates both paths identically.
 *
 * Rule based. It never invents prices - only hours, which the money layer
 * prices with the rate card.
 */

export type OfflineTask = 'triage' | 'scope' | 'verdict' | 'replies' | 'radar' | 'pricing' | 'proposal';

export interface OfflineContext {
  message?: string;
  agreedTerms?: string;
  clauses?: { ref: string; category: string; text: string }[];
  revisionsUsed?: number;
  includedRevisions?: number | null;
  projectTitle?: string;
  extraWorkSummary?: string;
  totalFormatted?: string;
  hours?: number;
  remainingRevisions?: number | null;
  /** Radar: the freelancer's skills and the web results to read. */
  skills?: string[];
  query?: string;
  results?: { title: string; url: string; content: string }[];
  /** Pricer: the gig being priced. */
  description?: string;
  hoursHint?: number | null;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'are', 'was', 'our', 'can', 'could', 'would', 'will', 'shall', 'with',
  'that', 'this', 'have', 'has', 'had', 'not', 'but', 'all', 'any', 'one', 'two', 'three', 'please', 'thank',
  'thanks', 'hi', 'hello', 'hey', 'just', 'also', 'add', 'make', 'need', 'want', 'like', 'give', 'lets', 'let',
  'from', 'into', 'about', 'there', 'here', 'they', 'them', 'were', 'been', 'being', 'does', 'doing', 'done',
]);

/** Words that usually mean "this is new work". */
const WORK_WORDS = new Set([
  'animation', 'animations', 'video', 'videos', 'photo', 'photos', 'photography', 'photographs', 'instagram',
  'feed', 'feeds', 'winter', 'summer', 'menu', 'page', 'pages', 'angle', 'angles', 'version', 'versions', 'render',
  'renders', 'model', 'models', 'slider', 'sliders', 'form', 'forms', 'integration', 'integrations', 'checkout',
  'translation', 'translations', 'blog', 'newsletter', 'logo', 'logos', 'icon', 'icons', 'seo', 'copy', 'copywriting',
  'poster', 'posters', 'banner', 'banners', 'illustration', 'illustrations', 'texture', 'textures', 'mockup',
  'mockups', 'wireframe', 'wireframes', 'prototype', 'prototypes', 'app', 'apps', 'mobile', 'dashboard', 'sound',
  'music', 'voiceover', 'subtitles', 'drone', 'photoshoot', 'shoot', 'shooting', 'background', 'backgrounds',
  'marble', 'slab', 'winter', 'launch', 'editor', 'editorial', 'story', 'stories', 'testimonial', 'testimonials',
  'colourway', 'colorway', 'backdrop', 'backdrops', 'cards', 'business', 'folder', 'template', 'templates',
  'batch', 'batches', 'variant', 'variants', 'frontend', 'front-end', 'backend', 'react', 'development',
]);

/** Words in an exclusion clause that say nothing about what was excluded. */
const GENERIC_WORDS = new Set([
  'design', 'designs', 'printing', 'print', 'delivery', 'work', 'service', 'services', 'support', 'included',
  'include', 'includes', 'not', 'are', 'extra', 'additional', 'deliverables', 'files', 'materials', 'content',
  'product', 'client', 'provides', 'deliver', 'round', 'rounds', 'revision', 'revisions', 'visual', 'per', 'app',
]);

/** Words that mean "small tweak", which is usually a revision round. */
const TWEAK_WORDS = new Set([
  'tweak', 'tweaks', 'tweaked', 'tiny', 'slightly', 'minor', 'small', 'nudge', 'adjust', 'adjustment', 'bigger',
  'bigger', 'radius', 'colour', 'color', 'font', 'spacing', 'align', 'alignment', 'swap', 'swapped', 'change',
  'changed', 'replace', 'replaced', 'move', 'moved', 'fix', 'fixes',
]);

/** The client has not decided yet, or the request is too vague to price. */
const VAGUE_PATTERN =
  /\b(might|unsure|not sure|undecided|not decided|let me check|check with the team|will confirm|get back to you|modern|modernise|modernize|nicer|better|prettier|cleaner|improve|improvement|polish|vibe|aesthetic|somehow|or something|something like that)\b/i;

/** The client is adding to the job. */
const CREEP_PATTERN =
  /\b(also|extra|additional|another|one more|one last|second|different|new|in addition|as well|more)\b/i;

/** Verbs that turn a mention into a request. */
const REQUEST_VERB_PATTERN =
  /\b(add|include|design|make|create|build|deliver|prepare|render|print|produce|redo|do|want|need|like|love|would|can|could|please|send|swap|replace|give|also|too)\b/i;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function contentWords(text: string): string[] {
  return words(text).filter((word) => !STOPWORDS.has(word));
}

/** "renders" in the scope covers "render" in the message. */
function coveredByScope(word: string, scopeWords: Set<string>): boolean {
  if (scopeWords.has(word)) return true;
  if (word.length < 4) return false;
  return [...scopeWords].some(
    (scopeWord) =>
      scopeWord.length >= 4 && (scopeWord.startsWith(word) || word.startsWith(scopeWord)),
  );
}

/** A number the message asks for that the scope never agreed to. */
function quantityOutsideScope(
  message: string,
  scopeWords: Set<string>,
  scopeNumbers: Set<string>,
): boolean {
  const tokens = message.split(/\s+/);
  for (let index = 0; index < tokens.length; index += 1) {
    for (const number of tokens[index].match(/\d+/g) ?? []) {
      if (scopeNumbers.has(number)) continue;
      const around = [
        ...tokens.slice(Math.max(0, index - 2), index),
        ...tokens.slice(index + 1, index + 3),
      ].map((token) => token.toLowerCase().replace(/[^a-z0-9-]/g, ''));
      if (
        around.some(
          (token) => coveredByScope(token, scopeWords) || WORK_WORDS.has(token),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

const GREETING =
  /^(hey|hi|hello|yo|thanks|thank you|ok|okay|sure|quick one|quick question|quick thing|good morning|good afternoon|good evening)\b[!,.\s-]*/i;

const REQUEST_PREFIX =
  /^(could you|can you|would you|will you|please|can we|could we|i'?d like you to|i would like you to|we need you to|need you to|any chance you could|want to)\b\s*/i;

const FILLER = /^(also|and|plus|as well|one more thing|one last thing|by the way|btw)\b\s*/i;

/** The request itself, without the greeting and without the "could you" noise. */
function requestSummary(text: string): string {
  let out = text.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(GREETING, '').replace(FILLER, '').replace(REQUEST_PREFIX, '').trim();
    if (next === out) break;
    out = next;
  }

  const sentences = out.split(/(?<=[.!?])\s+/);
  const sentence = sentences.find((part) => part.trim().length > 12) ?? sentences[0] ?? '';
  out = sentence.trim().replace(/[.,?!]+$/, '');
  if (out.length > 90) out = `${out.slice(0, 87)}...`;
  return out || text.trim().slice(0, 90);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const REQUEST_PATTERN =
  /\b(can you|could you|would you|will you|please|add|include|make|create|build|render|send|deliver|prepare|set up|change|swap|replace|redesign|redo|need|want|i'?d like|we need|need you|can we|could we|any chance)\b/i;

function triage(context: OfflineContext) {
  const message = context.message ?? '';
  const isRequest = REQUEST_PATTERN.test(message) || message.includes('?');
  const possibleCreep =
    isRequest &&
    /\b(also|extra|additional|another|one more|in addition|as well|different|second|new)\b/i.test(message);
  return { is_request: isRequest, possible_creep: possibleCreep, summary: requestSummary(message) };
}

function scope(context: OfflineContext) {
  const terms = context.agreedTerms ?? '';
  const deliverables: string[] = [];
  const exclusions: string[] = [];
  const assumptions: string[] = [];

  // Split on new lines, semicolons and sentence ends (but not decimals).
  const lines = terms
    .split(/[\n;]+/)
    .flatMap((line) => line.split(/(?<=[a-zA-Z)])\.\s+/));

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/\.$/, '');
    if (line.length < 4) continue;
    if (/\b(not included|excluded|excludes|does not include|isn't included|is not included|outside)\b/i.test(line)) {
      exclusions.push(line);
    } else if (/\b(revisions?|rounds?)\b/i.test(line)) {
      continue;
    } else if (/\b(client (provides|supplies|sends)|provided by|assume|assumes|supply|you will provide)\b/i.test(line)) {
      assumptions.push(line);
    } else if (/\b(deliver|include|page|render|design|mockup|video|logo|site|pack|batch|file|export)\w*/i.test(line)) {
      deliverables.push(line);
    }
  }

  const revisionMatch = terms.match(/(\d+)\s*(?:\w+\s*){0,3}revisions?/i);
  const priceMatch = terms.match(/(?:[$€£]\s?([\d.,]+))|([\d.,]+)\s?(?:usd|eur|gbp|dollars|euros)\b/i);
  const priceRaw = priceMatch?.[1] ?? priceMatch?.[2];
  const deadlineMatch = terms.match(/deadline[:\s]+([^\n;]+)/i);

  const price = priceRaw ? Number(priceRaw.replace(/[,\s]/g, '').replace(/\.$/, '')) : null;

  return {
    deliverables,
    exclusions,
    assumptions,
    included_revisions: revisionMatch ? Number(revisionMatch[1]) : null,
    deadline: deadlineMatch ? deadlineMatch[1].trim().replace(/\.$/, '') : null,
    price: Number.isFinite(price) ? price : null,
  };
}

function verdict(context: OfflineContext) {
  const message = context.message ?? '';
  const clauses = context.clauses ?? [];
  const scopeWords = new Set(clauses.flatMap((clause) => contentWords(clause.text)));
  const scopeNumbers = new Set(clauses.flatMap((clause) => clause.text.match(/\d+/g) ?? []));
  const messageWords = contentWords(message);
  const fresh = messageWords.filter((word) => !coveredByScope(word, scopeWords));

  const deliverable = clauses.filter((clause) => clause.category === 'deliverable');
  const exclusion = clauses.filter((clause) => clause.category === 'exclusion');
  const revision = clauses.filter((clause) => clause.category === 'revision_limit');

  const newWork = fresh.filter((word) => WORK_WORDS.has(word));
  const tweak = fresh.filter((word) => TWEAK_WORDS.has(word));
  const excluded = exclusion.some((clause) =>
    contentWords(clause.text)
      .filter((word) => !GENERIC_WORDS.has(word))
      .some((word) => messageWords.includes(word)),
  );
  const extraQuantity = quantityOutsideScope(message, scopeWords, scopeNumbers);
  const revisionsUsed = context.revisionsUsed ?? 0;
  const roundsLeft =
    context.includedRevisions == null ? null : context.includedRevisions - revisionsUsed;

  const out = (reasoning: string, hours: number, cited: { ref: string; text: string }[]) => ({
    verdict: 'OUT',
    clause_ids: cited.map((clause) => clause.ref),
    quoted_text: cited.map((clause) => clause.text),
    extra_work_items: [{ name: requestSummary(message), est_hours: hours }],
    reasoning,
    revisions_used_after: revisionsUsed,
  });

  if (VAGUE_PATTERN.test(message)) {
    const cited = revision.length > 0 ? revision : deliverable;
    return {
      verdict: 'GRAY',
      clause_ids: cited.map((clause) => clause.ref),
      quoted_text: cited.map((clause) => clause.text),
      extra_work_items: [],
      reasoning:
        'The client has not settled what they want yet, so there is nothing concrete to bill.',
      revisions_used_after: revisionsUsed,
    };
  }

  if (newWork.length > 0) {
    return out(
      `The request mentions ${newWork.slice(0, 3).join(', ')}, which the agreed scope does not cover.`,
      clamp(0.5 + 0.5 * newWork.length, 0.5, 8),
      [...deliverable, ...exclusion],
    );
  }

  if (excluded && REQUEST_VERB_PATTERN.test(message)) {
    return out(
      'The request asks for work the scope explicitly excludes, so it is billable extra work.',
      1,
      exclusion.length > 0 ? [...exclusion, ...deliverable] : deliverable,
    );
  }

  if (extraQuantity) {
    return out(
      'The request asks for a different amount of work than the scope agrees on.',
      1,
      deliverable.length > 0 ? deliverable : exclusion,
    );
  }

  if (tweak.length > 0) {
    if (roundsLeft != null && roundsLeft <= 0) {
      const cited = revision.length > 0 ? revision : deliverable;
      return out(
        'It is a small change, but every revision round is used, so it is billable extra work.',
        0.5,
        cited,
      );
    }
    const cited = revision.length > 0 ? revision : deliverable;
    return {
      verdict: 'GRAY',
      clause_ids: cited.map((clause) => clause.ref),
      quoted_text: cited.map((clause) => clause.text),
      extra_work_items: [{ name: requestSummary(message), est_hours: 0.5 }],
      reasoning:
        roundsLeft == null
          ? 'Looks like a small change, but the revision rounds are not stated, so it is worth confirming.'
          : `Looks like a small change, and ${roundsLeft} revision round(s) are still available to absorb it.`,
      revisions_used_after: revisionsUsed + 1,
    };
  }

  if (CREEP_PATTERN.test(message) && REQUEST_VERB_PATTERN.test(message)) {
    const cited = deliverable.length > 0 ? deliverable : revision;
    return {
      verdict: 'GRAY',
      clause_ids: cited.map((clause) => clause.ref),
      quoted_text: cited.map((clause) => clause.text),
      extra_work_items: [],
      reasoning:
        'The client is adding to the job but has not said what exactly, so it cannot be priced yet.',
      revisions_used_after: revisionsUsed,
    };
  }

  return {
    verdict: 'IN',
    clause_ids: [],
    quoted_text: [],
    extra_work_items: [],
    reasoning: 'The request is already covered by the agreed scope.',
    revisions_used_after: revisionsUsed,
  };
}

function replies(context: OfflineContext) {
  const total = context.totalFormatted ?? 'the quoted price';
  const hours = context.hours ?? 0;
  const summary = context.extraWorkSummary ?? 'the extra work';
  const remaining = context.remainingRevisions;

  // Nothing chargeable was priced (e.g. the client asked for the agreed work
  // for free): decline without inventing numbers.
  if (hours === 0) {
    return {
      warm: `Hey! I can't take this on for free - the agreed price is what covers the work we planned. If priorities change, we can re-quote together.`,
      firm: `I can't provide this for free. The agreed price covers the agreed work, and I'll keep delivering it as planned. If you want new terms, we re-scope and I quote the difference first.`,
      two_options: `Two options. 1) We continue exactly as agreed: same work, same price, same schedule. 2) We re-scope and I quote the difference first. Which works?`,
    };
  }

  const twoOptions = remaining
    ? `Option 1: I deliver it (${summary}) as a change order for ${total} (${hours}h). Option 2: it goes in as one of your ${remaining} remaining revision rounds, no extra cost. Which one?`
    : `Option 1: I deliver it (${summary}) as a change order for ${total} (${hours}h). Option 2: we trim it to the smallest useful part inside the current scope. Which one?`;

  return {
    warm: `Happy to do it. It sits outside what we agreed, so it's a ${total} change order for ${hours}h - say go and I'll start.`,
    firm: `This is outside the agreed scope, so I'd take it on as a change order: ${total} for ${hours}h. The rest of the job is unaffected. Shall I proceed?`,
    two_options: `Two ways forward. ${twoOptions}`,
  };
}

/** "$1,200 - $1,800" -> 1200..1800 in the stated currency. */
function parseBudget(text: string): { min: number; max: number; currency: string } | null {
  const match = text.match(/([$€£])\s?([\d,]+)(?:\s*(?:-|to|–|and)\s*[$€£]?\s?([\d,]+))?/i);
  if (!match) return null;
  const min = Number(match[2].replace(/,/g, ''));
  const max = match[3] ? Number(match[3].replace(/,/g, '')) : min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const currency = match[1] === '€' ? 'EUR' : match[1] === '£' ? 'GBP' : 'USD';
  return { min, max, currency };
}

/** "About 30 hours" -> 30. */
function parseHours(text: string): number | null {
  const match = text.match(/(\d+)\s*hours?/i);
  return match ? Number(match[1]) : null;
}

/** "$40 - $90 per hour" -> 40..90 per hour. */
function parseRateRange(text: string): { low: number; high: number; currency: string } | null {
  const match = text.match(
    /([$€£])\s?([\d,]+(?:\.\d+)?)\s*(?:-|to|–|and)\s*[$€£]?\s?([\d,]+(?:\.\d+)?)\s*(?:per|\/)\s*(?:an?\s*)?hour/i,
  );
  if (!match) return null;
  const low = Number(match[2].replace(/,/g, ''));
  const high = Number(match[3].replace(/,/g, ''));
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const currency = match[1] === '€' ? 'EUR' : match[1] === '£' ? 'GBP' : 'USD';
  return { low, high, currency };
}

function firstSentence(text: string): string[] {
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.trim();
  return sentence ? [sentence] : [];
}

/** Radar: read the postings the search returned and pull out the numbers. */
function radar(context: OfflineContext) {
  const results = context.results ?? [];

  return {
    results: results.map((result) => {
      const budget = parseBudget(result.content);
      const redFlags: string[] = [];
      if (!budget) redFlags.push('no_budget');
      if (/\b(free|unpaid|trial|for exposure)\b/i.test(result.content)) redFlags.push('free_work');

      return {
        title: result.title,
        url: result.url,
        est_hours: parseHours(result.content),
        budget_min: budget?.min ?? null,
        budget_max: budget?.max ?? null,
        budget_currency: budget?.currency ?? 'USD',
        requirements: firstSentence(result.content),
        red_flags: redFlags,
      };
    }),
  };
}

/** Pricer: estimate the hours and read the market range out of the sources. */
function pricing(context: OfflineContext) {
  const results = context.results ?? [];
  let low: { hourly: number; url: string; claim: string } | null = null;
  let high: { hourly: number; url: string; claim: string } | null = null;
  let currency = 'USD';

  for (const result of results) {
    const range = parseRateRange(result.content);
    if (!range) continue;
    const claim = `${result.title}: ${range.low} - ${range.high} per hour`;
    if (!low || range.low < low.hourly) low = { hourly: range.low, url: result.url, claim };
    if (!high || range.high > high.hourly) high = { hourly: range.high, url: result.url, claim };
    currency = range.currency;
  }

  const hours = context.hoursHint ?? 8;
  const range = low && high ? `${low.hourly} - ${high.hourly} per hour` : 'no published rate';

  return {
    est_hours: hours,
    market_low: low,
    market_high: high,
    market_currency: currency,
    rationale: `About ${hours} hours at your usual rate. The market range I found is ${range}, so quote in the middle of that band and never under your floor.`,
    sources: results.slice(0, 2).map((result) => ({ url: result.url, claim: result.title })),
  };
}

/** Proposal: the deliverables from the brief, plus safe defaults. */
function proposal(context: OfflineContext) {
  const lines = (context.description ?? '')
    .split(/[.\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const included =
    lines.length > 0
      ? lines.slice(0, 4).map((line) => line.charAt(0).toUpperCase() + line.slice(1))
      : ['The deliverables described in the brief.'];

  return {
    included,
    exclusions: [
      'Anything not listed above.',
      'Extra rounds of revisions beyond the agreed number.',
      'Work started before the content and files are delivered.',
    ],
    revisions_included: 2,
  };
}

export function offlineResponse(task: OfflineTask, context: OfflineContext): string {
  switch (task) {
    case 'triage':
      return JSON.stringify(triage(context));
    case 'scope':
      return JSON.stringify(scope(context));
    case 'verdict':
      return JSON.stringify(verdict(context));
    case 'replies':
      return JSON.stringify(replies(context));
    case 'radar':
      return JSON.stringify(radar(context));
    case 'pricing':
      return JSON.stringify(pricing(context));
    case 'proposal':
      return JSON.stringify(proposal(context));
  }
}
