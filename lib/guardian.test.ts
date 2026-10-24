import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { findStoredOutcome, validateCitations } from './guardian';
import { offlineResponse } from './offline-provider';

const clauses = [
  {
    ref: 'C1',
    category: 'deliverable',
    text: 'Landing site with hero section, menu page and contact form (5 pages total).',
  },
  { ref: 'C2', category: 'revision_limit', text: 'Two rounds of visual revisions are included.' },
  { ref: 'C3', category: 'exclusion', text: 'Photography and copywriting are not included.' },
];

describe('validateCitations', () => {
  it('accepts an exact quote of a real clause', () => {
    const result = validateCitations(
      { clause_ids: ['C1'], quoted_text: ['menu page and contact form'] },
      clauses,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a paraphrase', () => {
    const result = validateCitations(
      { clause_ids: ['C1'], quoted_text: ['menu and contact pages'] },
      clauses,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a clause id that is not in the stored scope', () => {
    const result = validateCitations({ clause_ids: ['C9'], quoted_text: [] }, clauses);
    expect(result.ok).toBe(false);
  });

  it('rejects quotes that come without a clause id', () => {
    const result = validateCitations(
      { clause_ids: [], quoted_text: ['Two rounds of visual revisions are included.'] },
      clauses,
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a verdict without citations', () => {
    expect(validateCitations({ clause_ids: [], quoted_text: [] }, clauses).ok).toBe(true);
  });
});

describe('offline provider', () => {
  it('cites real clauses with exact quotes for extra work', () => {
    const analysis = JSON.parse(
      offlineResponse('verdict', {
        message: 'Also can you add an Instagram feed section at the bottom of the page.',
        clauses,
        revisionsUsed: 1,
        includedRevisions: 2,
      }),
    );

    expect(analysis.verdict).toBe('OUT');
    expect(analysis.clause_ids.length).toBeGreaterThan(0);
    expect(validateCitations(analysis, clauses).ok).toBe(true);
  });

  it('calls a small tweak a grey area and prices it in hours, never in money', () => {
    const analysis = JSON.parse(
      offlineResponse('verdict', {
        message: 'One tiny tweak: make the button slightly bigger and change the corner radius.',
        clauses,
        revisionsUsed: 1,
        includedRevisions: 2,
      }),
    );

    expect(analysis.verdict).toBe('GRAY');
    expect(analysis.extra_work_items[0].est_hours).toBeGreaterThan(0);
    expect(JSON.stringify(analysis.extra_work_items)).not.toMatch(/[0-9]+\s*(usd|\$|eur)/i);
  });

  it('treats praise as no request at all', () => {
    const triage = JSON.parse(offlineResponse('triage', { message: 'I love it, looks great!' }));
    expect(triage.is_request).toBe(false);
  });
});

describe('findStoredOutcome', () => {
  const projectId = 'test_project_stored';
  const clientId = 'test_client_stored';

  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.verdicts).where(eq(schema.verdicts.projectId, projectId));
    await db.delete(schema.changeOrders).where(eq(schema.changeOrders.projectId, projectId));
    await db.delete(schema.messages).where(eq(schema.messages.projectId, projectId));
    await db.delete(schema.scopeClauses).where(eq(schema.scopeClauses.projectId, projectId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.clients).where(eq(schema.clients.id, clientId));
  });

  it('returns the stored verdict for a message that was checked before', async () => {
    const db = getDb();
    await db.insert(schema.clients).values({ id: clientId, name: 'Test Client', createdAt: new Date() });
    await db.insert(schema.projects).values({
      id: projectId,
      clientId,
      title: 'Test project',
      agreedPriceCents: 100_000,
      estimatedHours: 10,
      createdAt: new Date(),
    });
    await db.insert(schema.scopeClauses).values({
      id: 'test_clause_stored',
      projectId,
      ref: 'C1',
      category: 'deliverable',
      text: 'A landing page with one hero section.',
      sortOrder: 0,
    });
    await db.insert(schema.messages).values({
      id: 'test_message_stored',
      projectId,
      clientId,
      direction: 'in',
      body: 'Also add a second page.',
      createdAt: new Date(),
    });
    await db.insert(schema.verdicts).values({
      id: 'test_verdict_stored',
      messageId: 'test_message_stored',
      projectId,
      verdict: 'OUT',
      clauseRefs: JSON.stringify(['C1']),
      quotedText: JSON.stringify(['A landing page with one hero section.']),
      extraWorkItems: JSON.stringify([{ name: 'Second page', est_hours: 2 }]),
      reasoning: 'A second page is outside the agreed scope.',
      revisionsUsedAfter: 0,
      triageSummary: 'The client asks for another page.',
      replyDrafts: JSON.stringify({ warm: 'w', firm: 'f', two_options: 't' }),
      createdAt: new Date(),
    });

    const outcome = await findStoredOutcome(projectId, 'Also add a second page.');

    expect(outcome?.verdict).toBe('OUT');
    expect(outcome?.provider).toBe('stored');
    expect(outcome?.citedClauses.map((clause) => clause.ref)).toEqual(['C1']);
    expect(outcome?.extraWorkItems[0].est_hours).toBe(2);
    expect(outcome?.replies?.warm).toBe('w');
  });

  it('returns nothing for a message that was never checked', async () => {
    expect(await findStoredOutcome(projectId, 'A message nobody checked')).toBeNull();
  });
});
