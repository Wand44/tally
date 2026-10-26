import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { deleteProjectAction } from '@/app/actions';

// No Next runtime in tests; cache revalidation is a no-op here.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { changeOrders, clients, messages, projects, scopeClauses, verdicts } = schema;

const tag = `test:delete:${Date.now()}`;
const ids = {
  client: `${tag}:client`,
  project: `${tag}:project`,
  clause: `${tag}:clause`,
  message: `${tag}:message`,
  verdict: `${tag}:verdict`,
  order: `${tag}:order`,
};

afterAll(async () => {
  const db = getDb();
  await db.delete(clients).where(eq(clients.id, ids.client));
});

describe('deleteProjectAction', () => {
  it('removes the project and everything attached to it', async () => {
    const db = getDb();
    await db.insert(clients).values({ id: ids.client, name: 'Delete Test Client', createdAt: new Date() });
    await db.insert(projects).values({
      id: ids.project,
      clientId: ids.client,
      title: 'Delete me',
      status: 'active',
      agreedPriceCents: 100000,
      estimatedHours: 10,
      agreedTerms: '',
      revisionsUsed: 0,
      createdAt: new Date(),
    });
    await db.insert(scopeClauses).values({
      id: ids.clause, projectId: ids.project, ref: 'C1', category: 'deliverable', text: 'A thing', sortOrder: 1,
    });
    await db.insert(messages).values({
      id: ids.message, projectId: ids.project, clientId: ids.client, direction: 'in', body: 'Hi', createdAt: new Date(),
    });
    await db.insert(verdicts).values({
      id: ids.verdict, messageId: ids.message, projectId: ids.project, verdict: 'OUT', reasoning: 'extra', createdAt: new Date(),
    });
    await db.insert(changeOrders).values({
      id: ids.order, projectId: ids.project, clientId: ids.client, verdictId: ids.verdict,
      title: 'Extra thing', items: '[]', totalHours: 1, totalCents: 5000, netCents: 4000,
      status: 'draft', createdAt: new Date(),
    });

    await deleteProjectAction(ids.project);

    expect((await db.select().from(projects).where(eq(projects.id, ids.project))).length).toBe(0);
    expect((await db.select().from(scopeClauses).where(eq(scopeClauses.id, ids.clause))).length).toBe(0);
    expect((await db.select().from(messages).where(eq(messages.id, ids.message))).length).toBe(0);
    expect((await db.select().from(verdicts).where(eq(verdicts.id, ids.verdict))).length).toBe(0);
    expect((await db.select().from(changeOrders).where(eq(changeOrders.id, ids.order))).length).toBe(0);
  });
});
