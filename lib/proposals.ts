import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getWorkspace } from './dashboard';
import { completeJson } from './llm';
import { formatMoney } from './money';
import { proposalSystem, proposalUser } from './prompts/proposal';
import { proposalSchema } from './schemas';

const { quotes } = schema;

/** How much work fits in one working day. */
export const HOURS_PER_DAY = 4;

export type ProposalTone = 'friendly' | 'formal';

export interface Proposal {
  title: string;
  included: string[];
  exclusions: string[];
  revisionsIncluded: number;
  hours: number;
  priceCents: number;
  currency: string;
  deliveryDays: number;
  deliveryDate: string;
  /** 'nebius' or 'offline'. */
  provider: string;
  /** The terms the scope extractor can read. */
  scopeTerms: string;
  /** The whole proposal as plain text, for the copy button. */
  text: string;
}

/** Working days a job of this many hours takes. */
export function deliveryEstimate(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new RangeError(`hours must be greater than 0, got ${hours}`);
  }
  return Math.max(1, Math.ceil(hours / HOURS_PER_DAY));
}

/**
 * The delivery date as YYYY-MM-DD, skipping weekends. Holidays are not
 * skipped: the estimate is rough anyway.
 */
export function deliveryDate(days: number, from: Date = new Date()): string {
  const date = new Date(from.getTime());
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * The terms the scope extractor (F5) reads. Same shape as the agreed terms
 * the user would paste by hand.
 */
export function proposalScopeTerms(input: {
  included: string[];
  exclusions: string[];
  revisionsIncluded: number;
  deliveryDate: string;
  priceCents: number;
  currency: string;
}): string {
  return [
    `Deliverables: ${input.included.join('; ')}.`,
    `Included: ${input.revisionsIncluded} round${input.revisionsIncluded === 1 ? '' : 's'} of revisions.`,
    `Not included: ${input.exclusions.join('; ')}.`,
    `Deadline: ${input.deliveryDate}.`,
    `Price: ${formatMoney(input.priceCents, input.currency)}.`,
  ].join('\n');
}

/** Join a short list the way a sentence does: "a, b and c". */
function sentenceList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The proposal as the client reads it: a few sentences inside an existing
 * conversation. The price and the timeline are added here in code - the model
 * never writes a number. */
export function proposalText(input: {
  included: string[];
  exclusions: string[];
  revisionsIncluded: number;
  hours: number;
  priceCents: number;
  hourlyRateCents: number;
  currency: string;
  deliveryDays: number;
  deliveryDate: string;
}): string {
  return [
    `For ${formatMoney(input.priceCents, input.currency)} (${input.hours} hours at ${formatMoney(input.hourlyRateCents, input.currency)}/h, platform fee included) I'll deliver ${sentenceList(input.included)}.`,
    `${sentenceList(input.exclusions).charAt(0).toUpperCase() + sentenceList(input.exclusions).slice(1)} ${input.exclusions.length === 1 ? 'is' : 'are'} not part of this price.`,
    `Delivery by ${input.deliveryDate} (within ${input.deliveryDays} working day${input.deliveryDays === 1 ? '' : 's'}), with ${input.revisionsIncluded} round${input.revisionsIncluded === 1 ? '' : 's'} of revisions included.`,
  ].join(' ');
}

/**
 * Proposal (PRD F4): the proposal the freelancer sends to the client.
 *
 * The model writes the words. The price, the timeline and the revision count
 * in the text come from the quote and from code.
 */
export async function generateProposal(input: {
  quoteId: string;
  tone: ProposalTone;
}): Promise<Proposal> {
  const db = getDb();
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
  if (!quote) throw new Error('Quote not found.');

  const workspace = await getWorkspace();
  if (!workspace?.profile || !workspace.rateCard) {
    throw new Error('Set up your rate card first.');
  }

  const rateCard = workspace.rateCard;
  const skills = JSON.parse(workspace.profile.skills || '[]') as string[];
  const currency = rateCard.currency;

  const draft = await completeJson({
    task: 'proposal',
    tier: 'smart',
    schema: proposalSchema,
    system: proposalSystem,
    user: proposalUser({
      title: quote.title,
      description: quote.description,
      skills,
      freelancerName: workspace.profile.name,
      tone: input.tone,
    }),
    offline: {
      projectTitle: quote.title,
      description: quote.description,
      skills,
    },
  });

  const deliveryDays = deliveryEstimate(quote.hours);
  const date = deliveryDate(deliveryDays);

  const scopeTerms = proposalScopeTerms({
    included: draft.data.included,
    exclusions: draft.data.exclusions,
    revisionsIncluded: draft.data.revisions_included,
    deliveryDate: date,
    priceCents: quote.targetCents,
    currency,
  });

  return {
    title: quote.title,
    included: draft.data.included,
    exclusions: draft.data.exclusions,
    revisionsIncluded: draft.data.revisions_included,
    hours: quote.hours,
    priceCents: quote.targetCents,
    currency,
    deliveryDays,
    deliveryDate: date,
    provider: draft.provider,
    scopeTerms,
    text: proposalText({
      included: draft.data.included,
      exclusions: draft.data.exclusions,
      revisionsIncluded: draft.data.revisions_included,
      hours: quote.hours,
      priceCents: quote.targetCents,
      hourlyRateCents: rateCard.baseHourlyRateCents,
      currency,
      deliveryDays,
      deliveryDate: date,
    }),
  };
}
