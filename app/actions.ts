'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { seedDemoWorkspace } from '@/db/seed';
import { getWorkspace } from '@/lib/dashboard';
import { findStoredOutcome, runGuardian } from '@/lib/guardian';
import { completeJson } from '@/lib/llm';
import { priceGig, type QuoteOutcome } from '@/lib/pricing';
import { generateProposal, type Proposal, type ProposalTone } from '@/lib/proposals';
import { scopeSystem, scopeUser } from '@/lib/prompts/scope';
import { runRadar, type RadarGig } from '@/lib/radar';
import { checkRateLimit } from '@/lib/rate-limit';
import { scopeSchema } from '@/lib/schemas';
import { assignClauseRefs, revisionLimit, scopeToClauses, type ClauseDraft } from '@/lib/scope';

/** Who is calling: the IP behind the proxy, if there is one. */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'local';
}

/** One allowance for every AI run, so one client cannot burn the credits. */
async function allowAiRun(): Promise<{ ok: boolean; message?: string }> {
  const result = await checkRateLimit(`ai:${await clientIp()}`);
  if (result.allowed) return { ok: true };
  return {
    ok: false,
    message: `You have used all ${result.limit} runs for this hour. The next one is free after ${new Date(result.resetAt).toLocaleTimeString()}.`,
  };
}

const rateCardSchema = z.object({
  name: z.string().trim().min(1, 'Your name is required'),
  skills: z.string().trim().min(1, 'Add at least one skill'),
  experienceLevel: z.enum(['beginner', 'intermediate', 'expert'], {
    message: 'Pick an experience level',
  }),
  baseHourlyRate: z.coerce.number().positive('Your base rate must be above 0'),
  minHourlyRate: z.coerce.number().positive('Your minimum rate must be above 0'),
  feePercent: z.coerce.number().min(0, 'The fee cannot be negative').max(99.99, 'The fee must be below 100'),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  typicalWeeklyHours: z.coerce.number().int().min(1, 'At least 1 hour').max(80, 'That is more than a week'),
});

export interface RateCardState {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

/**
 * F1: the rate card is the single source of truth for every later quote.
 * Saving replaces the profile and its card, so editing the rate card
 * changes what Tally prices from now on.
 */
export async function saveRateCard(
  _previous: RateCardState,
  formData: FormData,
): Promise<RateCardState> {
  const parsed = rateCardSchema.safeParse({
    name: formData.get('name'),
    skills: formData.get('skills'),
    experienceLevel: formData.get('experienceLevel'),
    baseHourlyRate: formData.get('baseHourlyRate'),
    minHourlyRate: formData.get('minHourlyRate'),
    feePercent: formData.get('feePercent'),
    currency: formData.get('currency'),
    typicalWeeklyHours: formData.get('typicalWeeklyHours'),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      errors[key] ??= issue.message;
    }
    return { ok: false, message: 'Check the highlighted fields.', errors };
  }

  const data = parsed.data;
  const db = getDb();
  const { profiles, rateCards } = schema;

  const [existingProfile] = await db.select().from(profiles).limit(1);
  const profileId = existingProfile?.id ?? crypto.randomUUID();
  const skills = data.skills
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 12);

  const profileValues = {
    name: data.name,
    skills: JSON.stringify(skills),
    experienceLevel: data.experienceLevel,
    currency: data.currency,
    typicalWeeklyHours: data.typicalWeeklyHours,
  };

  if (existingProfile) {
    await db.update(profiles).set(profileValues).where(eq(profiles.id, profileId));
  } else {
    await db.insert(profiles).values({ id: profileId, ...profileValues, createdAt: new Date() });
  }

  const cardValues = {
    baseHourlyRateCents: Math.round(data.baseHourlyRate * 100),
    minHourlyRateCents: Math.round(data.minHourlyRate * 100),
    feePercent: data.feePercent,
    currency: data.currency,
    updatedAt: new Date(),
  };
  const [existingCard] = await db.select().from(rateCards).where(eq(rateCards.profileId, profileId)).limit(1);

  if (existingCard) {
    await db.update(rateCards).set(cardValues).where(eq(rateCards.id, existingCard.id));
  } else {
    await db.insert(rateCards).values({ id: crypto.randomUUID(), profileId, ...cardValues });
  }

  revalidatePath('/');
  redirect('/');
}

/* ------------------------------------------------------------------ */
/* F5: gig won -> structured scope                                      */
/* ------------------------------------------------------------------ */

export interface ScopeExtractionResult {
  ok: boolean;
  message?: string;
  clauses?: ClauseDraft[];
  includedRevisions?: number | null;
  deadline?: string | null;
  provider?: string;
}

/**
 * F5 step 1: turn the agreed terms the client wrote into a structured scope.
 * Nothing is saved yet - the freelancer edits the clauses before confirming.
 */
export async function extractScope(projectId: string, agreedTerms: string): Promise<ScopeExtractionResult> {
  const db = getDb();
  const { projects } = schema;
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, message: 'Project not found.' };

  const terms = agreedTerms.trim() || project.agreedTerms;
  if (!terms) return { ok: false, message: 'Paste the agreed terms first.' };

  const result = await completeJson({
    task: 'scope',
    tier: 'smart',
    schema: scopeSchema,
    system: scopeSystem,
    user: scopeUser(terms),
    offline: { agreedTerms: terms },
  });

  return {
    ok: true,
    clauses: scopeToClauses(result.data),
    includedRevisions: result.data.included_revisions,
    deadline: result.data.deadline,
    provider: result.provider,
  };
}

export interface ScopeSaveResult {
  ok: boolean;
  message?: string;
  refs?: string[];
}

/**
 * F5 step 2: save the edited scope. Clause ids stay stable, so verdicts can
 * keep citing C1, C2 ... after an edit.
 */
export async function saveScope(
  projectId: string,
  agreedTerms: string,
  clauses: ClauseDraft[],
): Promise<ScopeSaveResult> {
  const db = getDb();
  const { projects, scopeClauses } = schema;

  const clean = clauses
    .map((clause) => ({ category: clause.category, text: clause.text.trim() }))
    .filter((clause) => clause.text.length > 0);
  if (clean.length === 0) return { ok: false, message: 'Add at least one clause before saving.' };

  const existing = await db.select().from(scopeClauses).where(eq(scopeClauses.projectId, projectId));
  const withRefs = assignClauseRefs(clean, existing);

  await db.delete(scopeClauses).where(eq(scopeClauses.projectId, projectId));
  await db.insert(scopeClauses).values(
    withRefs.map((clause, index) => ({
      id: crypto.randomUUID(),
      projectId,
      ref: clause.ref,
      category: clause.category,
      text: clause.text,
      sortOrder: index + 1,
    })),
  );

  await db
    .update(projects)
    .set({ agreedTerms: agreedTerms.trim(), includedRevisions: revisionLimit(withRefs) })
    .where(eq(projects.id, projectId));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/');
  return { ok: true, refs: withRefs.map((clause) => clause.ref) };
}

/* ------------------------------------------------------------------ */
/* F6: the Guardian                                                     */
/* ------------------------------------------------------------------ */

export interface GuardianActionResult {
  ok: boolean;
  message?: string;
  outcome?: Awaited<ReturnType<typeof runGuardian>>;
}

/** F6: triage the message, compare it with the scope and price the extra work. */
export async function runGuardianAction(
  projectId: string,
  message: string,
  options?: { useStored?: boolean },
): Promise<GuardianActionResult> {
  if (!message.trim()) return { ok: false, message: 'Paste the client message first.' };
  try {
    const body = message.trim();

    // A message we already checked: reuse the stored verdict, no credits used.
    if (options?.useStored) {
      const stored = await findStoredOutcome(projectId, body);
      if (stored) return { ok: true, outcome: stored };
    }

    const allowed = await allowAiRun();
    if (!allowed.ok) return { ok: false, message: allowed.message };

    const outcome = await runGuardian({ projectId, message: body });
    revalidatePath('/');
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, outcome };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/** F6: the freelancer sends the change order. */
export async function sendChangeOrderAction(changeOrderId: string): Promise<{ ok: boolean }> {
  const db = getDb();
  const { changeOrders } = schema;
  await db
    .update(changeOrders)
    .set({ status: 'sent', sentAt: new Date() })
    .where(eq(changeOrders.id, changeOrderId));
  revalidatePath('/');
  return { ok: true };
}

/** F6: the freelancer sends one of the three reply drafts to the client. */
export async function sendReplyAction(
  verdictId: string,
  tone: 'warm' | 'firm' | 'two_options',
): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();
  const { messages, projects, verdicts } = schema;

  const [verdict] = await db.select().from(verdicts).where(eq(verdicts.id, verdictId)).limit(1);
  if (!verdict) return { ok: false, message: 'Verdict not found.' };

  const drafts = JSON.parse(verdict.replyDrafts || '{}') as Record<string, string>;
  const body = drafts[tone];
  if (!body) return { ok: false, message: 'No draft for that tone.' };

  const [project] = await db.select().from(projects).where(eq(projects.id, verdict.projectId)).limit(1);
  if (!project) return { ok: false, message: 'Project not found.' };

  await db.insert(messages).values({
    id: crypto.randomUUID(),
    projectId: project.id,
    clientId: project.clientId,
    direction: 'out',
    body,
    createdAt: new Date(),
  });

  revalidatePath('/');
  revalidatePath(`/projects/${project.id}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* F2: Radar, F3: Pricer                                                */
/* ------------------------------------------------------------------ */

export interface RadarActionResult {
  ok: boolean;
  message?: string;
  gigs?: (RadarGig & { id: string })[];
  provider?: string;
  searchProvider?: string;
}

/**
 * F2: find public gig postings and rank them against this freelancer.
 * The shortlist is replaced by the new run.
 */
export async function runRadarAction(query: string): Promise<RadarActionResult> {
  const db = getDb();
  const { gigs } = schema;
  const workspace = await getWorkspace();
  if (!workspace?.rateCard || !workspace.profile) {
    return { ok: false, message: 'Set up your rate card first.' };
  }

  const rateCard = workspace.rateCard;
  const skills = JSON.parse(workspace.profile.skills || '[]') as string[];
  const searchQuery = query.trim() || skills.join(' ');

  try {
    const allowed = await allowAiRun();
    if (!allowed.ok) return { ok: false, message: allowed.message };

    const outcome = await runRadar({
      query: searchQuery,
      skills,
      minHourlyRateCents: rateCard.minHourlyRateCents,
      currency: rateCard.currency,
    });

    const profileId = workspace.profile.id;
    await db.delete(gigs).where(eq(gigs.profileId, profileId));

    const rows = outcome.gigs.map((gig) => ({
      id: crypto.randomUUID(),
      profileId,
      query: searchQuery,
      title: gig.title,
      url: gig.url,
      snippet: gig.snippet,
      budgetMinCents: gig.budgetMinCents,
      budgetMaxCents: gig.budgetMaxCents,
      budgetCurrency: gig.budgetCurrency,
      estHours: gig.estHours,
      requirements: JSON.stringify(gig.requirements),
      redFlags: JSON.stringify(gig.redFlags),
      score: gig.score,
      fitScore: gig.fitScore,
      budgetScore: gig.budgetScore,
      impliedHourlyCents: gig.impliedHourlyCents,
      createdAt: new Date(),
    }));

    if (rows.length > 0) await db.insert(gigs).values(rows);

    return {
      ok: true,
      gigs: outcome.gigs.map((gig, index) => ({ ...gig, id: rows[index].id })),
      provider: outcome.provider,
      searchProvider: outcome.searchProvider,
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export interface PriceActionResult {
  ok: boolean;
  message?: string;
  quote?: QuoteOutcome;
}

/** F3: price a gig with the rate card, the market sources and the floor. */
export async function priceGigAction(input: {
  gigId?: string | null;
  title?: string;
  description?: string;
  hours?: number | null;
  clientName?: string;
}): Promise<PriceActionResult> {
  try {
    const allowed = await allowAiRun();
    if (!allowed.ok) return { ok: false, message: allowed.message };

    const quote = await priceGig(input);
    revalidatePath('/price');
    return { ok: true, quote };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export interface ProposalActionResult {
  ok: boolean;
  message?: string;
  proposal?: Proposal;
}

/** F4: write the proposal for a quote. */
export async function generateProposalAction(input: {
  quoteId: string;
  tone: ProposalTone;
}): Promise<ProposalActionResult> {
  try {
    const allowed = await allowAiRun();
    if (!allowed.ok) return { ok: false, message: allowed.message };

    const proposal = await generateProposal(input);
    return { ok: true, proposal };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* F8: demo mode                                                        */
/* ------------------------------------------------------------------ */

export async function loadDemoAction(): Promise<void> {
  const workspace = await getWorkspace();
  if (!workspace) {
    await seedDemoWorkspace();
  }
  redirect('/');
}
