import { z } from 'zod';

/** Every LLM output is validated with one of these schemas (PRD section 6). */

export const triageSchema = z.object({
  is_request: z.boolean(),
  possible_creep: z.boolean(),
  summary: z.string().min(1),
});
export type Triage = z.infer<typeof triageSchema>;

export const scopeSchema = z.object({
  deliverables: z.array(z.string().min(1)),
  exclusions: z.array(z.string().min(1)),
  assumptions: z.array(z.string().min(1)),
  included_revisions: z.number().int().min(0).nullable(),
  deadline: z.string().nullable(),
  price: z.number().nonnegative().nullable(),
});
export type ScopeExtraction = z.infer<typeof scopeSchema>;

export const extraWorkItemSchema = z.object({
  name: z.string().min(1),
  est_hours: z.number().positive().max(200),
});
export type ExtraWorkItem = z.infer<typeof extraWorkItemSchema>;

export const verdictSchema = z.object({
  verdict: z.enum(['IN', 'GRAY', 'OUT']),
  clause_ids: z.array(z.string().min(1)),
  quoted_text: z.array(z.string().min(1)),
  extra_work_items: z.array(extraWorkItemSchema),
  reasoning: z.string().min(1),
  revisions_used_after: z.number().int().min(0),
});
export type VerdictAnalysis = z.infer<typeof verdictSchema>;

export const repliesSchema = z.object({
  warm: z.string().min(1),
  firm: z.string().min(1),
  two_options: z.string().min(1),
});
export type ReplyDrafts = z.infer<typeof repliesSchema>;

export const RED_FLAGS = ['vague_scope', 'free_work', 'no_budget'] as const;

export const radarSchema = z.object({
  results: z.array(
    z.object({
      title: z.string().min(1),
      url: z.string().min(1),
      est_hours: z.number().positive().max(1000).nullable(),
      budget_min: z.number().nonnegative().nullable(),
      budget_max: z.number().nonnegative().nullable(),
      budget_currency: z.string().length(3),
      requirements: z.array(z.string().min(1)),
      red_flags: z.array(z.enum(RED_FLAGS)),
    }),
  ),
});
export type RadarExtraction = z.infer<typeof radarSchema>;

/** A market rate with the source that states it. */
export const marketClaimSchema = z.object({
  /** The hourly rate in whole currency units. */
  hourly: z.number().nonnegative(),
  url: z.string().min(1),
  claim: z.string().min(1),
});
export type MarketClaim = z.infer<typeof marketClaimSchema>;

export const pricingSchema = z.object({
  est_hours: z.number().positive().max(1000),
  market_low: marketClaimSchema.nullable(),
  market_high: marketClaimSchema.nullable(),
  market_currency: z.string().length(3),
  rationale: z.string().min(1),
  sources: z.array(z.object({ url: z.string().min(1), claim: z.string().min(1) })),
});
export type PricingAnalysis = z.infer<typeof pricingSchema>;

/** The Proposal (F4): the prose the freelancer sends. The price and the
 * timeline are added in code, never written by the model. */
export const proposalSchema = z.object({
  intro: z.string().min(1),
  included: z.array(z.string().min(1)).min(1),
  exclusions: z.array(z.string().min(1)).min(1),
  revisions_included: z.number().int().min(0).max(10),
  closing: z.string().min(1),
});
export type ProposalDraft = z.infer<typeof proposalSchema>;
