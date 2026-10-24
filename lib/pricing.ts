import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getDashboardData, getWorkspace, type ClientRisk } from './dashboard';
import { completeJson } from './llm';
import { quotePricing, riskPaddingPercent, type QuoteTotals } from './money';
import { pricingSystem, pricingUser } from './prompts/pricing';
import { pricingSchema, type MarketClaim } from './schemas';
import { searchWeb } from './search';

const { gigs, quotes } = schema;

export interface QuoteSource {
  url: string;
  claim: string;
  title: string;
}

export interface QuoteOutcome {
  quoteId: string;
  title: string;
  description: string;
  hours: number;
  totals: QuoteTotals;
  rationale: string;
  sources: QuoteSource[];
  /** 'nebius' or 'offline'. */
  provider: string;
  /** 'tavily' or 'offline'. */
  searchProvider: string;
  marketNote: string;
  riskNote: string;
  rateNote: string;
  currency: string;
}

export interface PriceInput {
  gigId?: string | null;
  title?: string;
  description?: string;
  /** The freelancer's own hours estimate. The model's estimate is used when empty. */
  hours?: number | null;
  /** Optional client name, matched against the clients Tally already knows. */
  clientName?: string;
}

/**
 * Pricer (PRD F3): price a gig with the rate card, back the range with market
 * sources and never drop below the floor rate.
 *
 * The model estimates the hours, reads the market range and writes the
 * rationale. The price itself is computed in code.
 */
export async function priceGig(input: PriceInput): Promise<QuoteOutcome> {
  const db = getDb();
  const workspace = await getWorkspace();
  if (!workspace?.rateCard) {
    throw new Error('Set up your rate card before pricing a gig.');
  }

  const rateCard = workspace.rateCard;
  const skills = JSON.parse(workspace.profile?.skills ?? '[]') as string[];

  // The gig: either one Radar found, or a description pasted by hand.
  let title = input.title?.trim() ?? '';
  let description = input.description?.trim() ?? '';
  let gigId: string | null = null;
  let gigHours: number | null = null;

  if (input.gigId) {
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, input.gigId)).limit(1);
    if (gig) {
      gigId = gig.id;
      title = gig.title;
      description = gig.snippet;
      gigHours = gig.estHours;
    }
  }

  const search = await searchWeb(`${skills.join(', ')} freelance rate per hour`, 6);

  const analysis = await completeJson({
    task: 'pricing',
    tier: 'smart',
    schema: pricingSchema,
    system: pricingSystem,
    user: pricingUser({
      description: `${title}\n${description}`.trim(),
      skills,
      hoursHint: input.hours ?? gigHours,
      results: search.results,
    }),
    offline: {
      description: `${title}\n${description}`.trim(),
      hoursHint: input.hours ?? gigHours,
      results: search.results,
    },
  });

  const hours = input.hours ?? gigHours ?? analysis.data.est_hours;

  // Only sources that came back from the search are kept: no invented links.
  const byUrl = new Map(search.results.map((result) => [result.url, result]));
  const verified = (claim: MarketClaim | null) => (claim && byUrl.has(claim.url) ? claim : null);

  const sources: QuoteSource[] = [
    ...analysis.data.sources
      .filter((source) => byUrl.has(source.url))
      .map((source) => ({
        url: source.url,
        claim: source.claim,
        title: byUrl.get(source.url)?.title ?? source.url,
      })),
    ...[verified(analysis.data.market_low), verified(analysis.data.market_high)]
      .filter((claim): claim is MarketClaim => claim !== null)
      .map((claim) => ({
        url: claim.url,
        claim: claim.claim,
        title: byUrl.get(claim.url)?.title ?? claim.url,
      })),
  ].filter(
    (source, index, all) => all.findIndex((other) => other.url === source.url) === index,
  );

  // A market rate in another currency cannot be compared without an exchange
  // rate, so it is shown but never used in the math.
  const sameCurrency = analysis.data.market_currency.toUpperCase() === rateCard.currency.toUpperCase();
  const marketLow = verified(analysis.data.market_low);
  const marketHigh = verified(analysis.data.market_high);
  const marketLowHourlyCents =
    sameCurrency && marketLow ? Math.round(marketLow.hourly * 100) : null;
  const marketHighHourlyCents =
    sameCurrency && marketHigh ? Math.round(marketHigh.hourly * 100) : null;

  const risk = await clientRisk(input.clientName);
  const padding = risk ? riskPaddingPercent(risk.level) : 0;

  const totals = quotePricing({
    hours,
    baseHourlyRateCents: rateCard.baseHourlyRateCents,
    minHourlyRateCents: rateCard.minHourlyRateCents,
    feePercent: rateCard.feePercent,
    riskPaddingPercent: padding,
    marketLowHourlyCents,
    marketHighHourlyCents,
  });

  const rangeSourceCount = new Set([marketLow?.url, marketHigh?.url].filter(Boolean)).size;
  const marketNote = marketLowHourlyCents && marketHighHourlyCents
    ? `Market range ${rateCard.currency} ${marketLowHourlyCents / 100} - ${marketHighHourlyCents / 100} per hour, from ${rangeSourceCount} source${rangeSourceCount === 1 ? '' : 's'}.`
    : analysis.data.market_currency.toUpperCase() !== rateCard.currency.toUpperCase()
      ? `The sources are in ${analysis.data.market_currency.toUpperCase()}, so the market range is not used in the price.`
      : 'No published market rate was found in the sources.';

  const quoteId = `quote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  await db.insert(quotes).values({
    id: quoteId,
    gigId,
    title: title || 'Untitled gig',
    description,
    hours,
    lowCents: totals.lowCents,
    targetCents: totals.targetCents,
    highCents: totals.highCents,
    netCents: totals.netCents,
    netHourlyCents: totals.netHourlyCents,
    floorCents: totals.floorCents,
    riskPaddingPercent: padding,
    rationale: analysis.data.rationale,
    sources: JSON.stringify(sources),
    createdAt: new Date(),
  });

  return {
    quoteId,
    title: title || 'Untitled gig',
    description,
    hours,
    totals,
    rationale: analysis.data.rationale,
    sources,
    provider: analysis.provider,
    searchProvider: search.provider,
    marketNote,
    riskNote: riskNote(risk, input.clientName),
    rateNote: `Your rate ${rateCard.currency} ${rateCard.baseHourlyRateCents / 100}/h, floor ${rateCard.currency} ${rateCard.minHourlyRateCents / 100}/h, platform fee ${rateCard.feePercent}%.`,
    currency: rateCard.currency,
  };
}

/**
 * Risk padding from what we already know about the client: someone who keeps
 * pushing the scope gets a bigger quote (PRD F3).
 */
async function clientRisk(clientName?: string): Promise<ClientRisk | null> {
  const name = clientName?.trim();
  if (!name) return null;
  const data = await getDashboardData();
  const match = data.clients.find((client) => client.name.toLowerCase() === name.toLowerCase());
  return match ?? null;
}

function riskNote(risk: ClientRisk | null, clientName?: string): string {
  if (!risk) {
    return clientName?.trim()
      ? `No history for ${clientName.trim()}, so no risk padding was added.`
      : 'No client history, so no risk padding was added.';
  }
  const padding = riskPaddingPercent(risk.level);
  return padding > 0
    ? `${risk.name} is a ${risk.level} risk client, so ${padding}% was added to the quote.`
    : `${risk.name} is a ${risk.level} risk client, so no padding was added.`;
}
