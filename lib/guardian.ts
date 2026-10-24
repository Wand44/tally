import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { completeJson } from './llm';
import { changeOrderTotal, formatMoney } from './money';
import { repliesSystem, repliesUser } from './prompts/replies';
import { triageSystem, triageUser } from './prompts/triage';
import { verdictSystem, verdictUser } from './prompts/verdict';
import { repliesSchema, triageSchema, verdictSchema, type VerdictAnalysis } from './schemas';

const { changeOrders, messages, projects, rateCards, scopeClauses, verdicts } = schema;

export interface GuardianOutcome {
  messageId: string;
  verdictId: string;
  /** The message was not a request, so there is nothing to do. */
  noAction: boolean;
  summary: string;
  provider: string;
  verdict: 'IN' | 'GRAY' | 'OUT' | null;
  reasoning: string;
  citedClauses: { ref: string; category: string; text: string }[];
  extraWorkItems: { name: string; est_hours: number }[];
  revisionsUsedAfter: number | null;
  changeOrder: {
    id: string;
    title: string;
    totalHours: number;
    totalCents: number;
    netCents: number;
    status: string;
  } | null;
  replies: { warm: string; firm: string; two_options: string } | null;
  /** Set when the citations failed validation and the verdict was downgraded. */
  validationNote: string;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Citations must be real: every clause id has to exist and every quote has to
 * be an exact substring of the stored scope.
 */
export function validateCitations(
  analysis: Pick<VerdictAnalysis, 'clause_ids' | 'quoted_text'>,
  clauses: { ref: string; text: string }[],
): { ok: true } | { ok: false; reason: string } {
  const known = new Set(clauses.map((clause) => clause.ref));

  for (const id of analysis.clause_ids) {
    if (!known.has(id)) return { ok: false, reason: `clause id ${id} is not in the stored scope` };
  }

  const scopeText = normalizeWhitespace(clauses.map((clause) => clause.text).join(' '));
  for (const quote of analysis.quoted_text) {
    if (!scopeText.includes(normalizeWhitespace(quote))) {
      return { ok: false, reason: `quote "${quote.slice(0, 40)}..." is not an exact substring of the scope` };
    }
  }

  if (analysis.clause_ids.length === 0 && analysis.quoted_text.length > 0) {
    return { ok: false, reason: 'quotes were given without a clause id' };
  }

  return { ok: true };
}

/**
 * The stored verdict for a message that was already checked in this project.
 *
 * The demo mode uses it so the sample messages cost no credits: the verdict,
 * the cited clauses, the priced change order and the reply drafts come back
 * from the database instead of from the model.
 */
export async function findStoredOutcome(
  projectId: string,
  body: string,
): Promise<GuardianOutcome | null> {
  const db = getDb();

  const [message] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.projectId, projectId),
        eq(messages.direction, 'in'),
        eq(messages.body, body),
      ),
    )
    .limit(1);
  if (!message) return null;

  const [verdict] = await db.select().from(verdicts).where(eq(verdicts.messageId, message.id)).limit(1);
  if (!verdict) return null;

  const clauses = await db
    .select()
    .from(scopeClauses)
    .where(eq(scopeClauses.projectId, projectId))
    .orderBy(scopeClauses.sortOrder);

  const clauseRefs = JSON.parse(verdict.clauseRefs) as string[];
  const extraWorkItems = JSON.parse(verdict.extraWorkItems) as { name: string; est_hours: number }[];
  const drafts = JSON.parse(verdict.replyDrafts || '{}') as {
    warm?: string;
    firm?: string;
    two_options?: string;
  };

  const [order] = await db
    .select()
    .from(changeOrders)
    .where(eq(changeOrders.verdictId, verdict.id))
    .limit(1);

  return {
    messageId: message.id,
    verdictId: verdict.id,
    noAction: false,
    summary: verdict.triageSummary,
    provider: 'stored',
    verdict: verdict.verdict as 'IN' | 'GRAY' | 'OUT',
    reasoning: verdict.reasoning,
    citedClauses: clauses
      .filter((clause) => clauseRefs.includes(clause.ref))
      .map((clause) => ({ ref: clause.ref, category: clause.category, text: clause.text })),
    extraWorkItems,
    revisionsUsedAfter: verdict.revisionsUsedAfter,
    changeOrder: order
      ? {
          id: order.id,
          title: order.title,
          totalHours: order.totalHours,
          totalCents: order.totalCents,
          netCents: order.netCents,
          status: order.status,
        }
      : null,
    replies:
      drafts.warm && drafts.firm && drafts.two_options
        ? { warm: drafts.warm, firm: drafts.firm, two_options: drafts.two_options }
        : null,
    validationNote: verdict.validationNote,
  };
}

export async function runGuardian(input: { projectId: string; message: string }): Promise<GuardianOutcome> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
  if (!project) throw new Error('Project not found');

  const clauses = await db
    .select()
    .from(scopeClauses)
    .where(eq(scopeClauses.projectId, project.id))
    .orderBy(scopeClauses.sortOrder);

  const [rateCard] = await db.select().from(rateCards).limit(1);
  if (!rateCard) throw new Error('No rate card yet - set it up before checking messages.');

  const messageId = crypto.randomUUID();
  await db.insert(messages).values({
    id: messageId,
    projectId: project.id,
    clientId: project.clientId,
    direction: 'in',
    body: input.message,
    createdAt: new Date(),
  });

  // Step 1: triage with the cheap model.
  const triage = await completeJson({
    task: 'triage',
    tier: 'fast',
    schema: triageSchema,
    system: triageSystem,
    user: triageUser(input.message),
    offline: { message: input.message },
  });

  const outcome: GuardianOutcome = {
    messageId,
    verdictId: '',
    noAction: !triage.data.is_request,
    summary: triage.data.summary,
    provider: triage.provider,
    verdict: null,
    reasoning: '',
    citedClauses: [],
    extraWorkItems: [],
    revisionsUsedAfter: null,
    changeOrder: null,
    replies: null,
    validationNote: '',
  };

  if (!triage.data.is_request) return outcome;

  const revisionsUsed = project.revisionsUsed;
  const includedRevisions = project.includedRevisions;
  const analysisInput = {
    message: input.message,
    clauses: clauses.map((clause) => ({ ref: clause.ref, category: clause.category, text: clause.text })),
    revisionsUsed,
    includedRevisions,
  };

  // Step 2: analysis with the smart model.
  const first = await completeJson({
    task: 'verdict',
    tier: 'smart',
    schema: verdictSchema,
    system: verdictSystem,
    user: verdictUser(analysisInput),
    offline: analysisInput,
  });

  let analysis: VerdictAnalysis;
  let validationNote = '';

  const firstCheck = validateCitations(first.data, clauses);
  if (firstCheck.ok) {
    analysis = first.data;
  } else {
    const second = await completeJson({
      task: 'verdict',
      tier: 'smart',
      schema: verdictSchema,
      system: verdictSystem,
      user: verdictUser({ ...analysisInput, previousFailure: firstCheck.reason }),
      offline: analysisInput,
    });
    const secondCheck = validateCitations(second.data, clauses);
    if (secondCheck.ok) {
      analysis = second.data;
      validationNote = `First answer rejected (${firstCheck.reason}), retried and accepted.`;
    } else {
      analysis = {
        verdict: 'GRAY',
        clause_ids: [],
        quoted_text: [],
        extra_work_items: [],
        reasoning: 'The citations could not be verified against the stored scope, so this needs a human look.',
        revisions_used_after: revisionsUsed,
      };
      validationNote = `Citations failed validation (${secondCheck.reason}). Verdict downgraded to GRAY.`;
    }
  }

  outcome.verdict = analysis.verdict;
  outcome.reasoning = analysis.reasoning;
  outcome.extraWorkItems = analysis.extra_work_items;
  outcome.revisionsUsedAfter = analysis.revisions_used_after;
  outcome.validationNote = validationNote;
  outcome.citedClauses = clauses
    .filter((clause) => analysis.clause_ids.includes(clause.ref))
    .map((clause) => ({ ref: clause.ref, category: clause.category, text: clause.text }));

  // Step 3: price the extra work in code.
  const items = analysis.extra_work_items.map((item) => ({ name: item.name, estHours: item.est_hours }));
  const totals = changeOrderTotal(items, rateCard.baseHourlyRateCents, rateCard.feePercent);

  const verdictId = crypto.randomUUID();
  outcome.verdictId = verdictId;
  await db.insert(verdicts).values({
    id: verdictId,
    messageId,
    projectId: project.id,
    verdict: analysis.verdict,
    clauseRefs: JSON.stringify(analysis.clause_ids),
    quotedText: JSON.stringify(analysis.quoted_text),
    extraWorkItems: JSON.stringify(analysis.extra_work_items),
    reasoning: analysis.reasoning,
    revisionsUsedAfter: analysis.revisions_used_after,
    triageSummary: triage.data.summary,
    replyDrafts: '{}',
    validationNote,
    createdAt: new Date(),
  });

  if (totals.totalHours > 0) {
    const changeOrderId = crypto.randomUUID();
    const rawTitle = items[0]?.name ?? `Extra work on ${project.title}`;
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
    await db.insert(changeOrders).values({
      id: changeOrderId,
      projectId: project.id,
      clientId: project.clientId,
      verdictId,
      title: title.slice(0, 120),
      items: JSON.stringify(items),
      totalHours: totals.totalHours,
      totalCents: totals.totalCents,
      netCents: totals.netCents,
      status: 'draft',
      sentAt: null,
      createdAt: new Date(),
    });
    outcome.changeOrder = {
      id: changeOrderId,
      title: title.slice(0, 120),
      totalHours: totals.totalHours,
      totalCents: totals.totalCents,
      netCents: totals.netCents,
      status: 'draft',
    };
  }

  // Step 4: three client-facing reply drafts. No internal reasoning in them.
  if (analysis.verdict !== 'IN') {
    const remainingRevisions =
      includedRevisions != null ? Math.max(0, includedRevisions - revisionsUsed) : null;
    const drafts = await completeJson({
      task: 'replies',
      tier: 'smart',
      schema: repliesSchema,
      system: repliesSystem,
      user: repliesUser({
        message: input.message,
        projectTitle: project.title,
        verdict: analysis.verdict,
        extraWorkSummary:
          items.map((item) => item.name).join('; ') || 'the additional work you asked for',
        totalFormatted: formatMoney(totals.totalCents, rateCard.currency),
        hours: totals.totalHours,
        includedRevisions,
        remainingRevisions,
      }),
      offline: {
        message: input.message,
        projectTitle: project.title,
        extraWorkSummary: items.map((item) => item.name).join('; '),
        totalFormatted: formatMoney(totals.totalCents, rateCard.currency),
        hours: totals.totalHours,
        includedRevisions,
        remainingRevisions,
      },
    });
    outcome.replies = drafts.data;
    await db.update(verdicts).set({ replyDrafts: JSON.stringify(drafts.data) }).where(eq(verdicts.id, verdictId));
  }

  if ((analysis.verdict === 'IN' || analysis.verdict === 'GRAY') && analysis.revisions_used_after > revisionsUsed) {
    await db.update(projects).set({ revisionsUsed: analysis.revisions_used_after }).where(eq(projects.id, project.id));
  }

  return outcome;
}
