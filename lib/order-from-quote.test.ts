import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { createOrderFromQuoteAction } from '@/app/actions';

// No Next runtime in tests; cache revalidation is a no-op here.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { clients, projects, quotes } = schema;

const tag = `test:quote-order:${Date.now()}`;
const quoteId = `${tag}:quote`;
const clientName = `${tag} Client`;
let projectId = '';

afterAll(async () => {
  const db = getDb();
  if (projectId) await db.delete(projects).where(eq(projects.id, projectId));
  await db.delete(clients).where(eq(clients.name, clientName));
  await db.delete(quotes).where(eq(quotes.id, quoteId));
});

describe('createOrderFromQuoteAction', () => {
  it('creates a client and a project from the quote, carrying the proposal terms', async () => {
    const db = getDb();
    await db.insert(quotes).values({
      id: quoteId,
      title: `${tag} render pack`,
      description: '12 product renders in Blender',
      hours: 30,
      lowCents: 100000,
      targetCents: 150000,
      highCents: 200000,
      netCents: 120000,
      netHourlyCents: 4000,
      floorCents: 100000,
      createdAt: new Date(),
    });

    const terms = 'Deliverables: 12 renders. Revisions: 2 rounds. Exclusions: animation. Price: $1,500.00.';
    const result = await createOrderFromQuoteAction({ quoteId, clientName, terms });

    expect(result.ok).toBe(true);
    expect(result.projectId).toBeTruthy();
    projectId = result.projectId!;

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.title).toBe(`${tag} render pack`);
    expect(project.agreedPriceCents).toBe(150000);
    expect(project.estimatedHours).toBe(30);
    expect(project.agreedTerms).toBe(terms);
    expect(project.status).toBe('active');

    const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
    expect(client.name).toBe(clientName);
  });

  it('reuses an existing client by name', async () => {
    const second = await createOrderFromQuoteAction({ quoteId, clientName, terms: undefined });
    expect(second.ok).toBe(true);
    const db = getDb();
    const matches = await db.select().from(clients).where(eq(clients.name, clientName));
    expect(matches).toHaveLength(1);
    if (second.projectId) projectId = second.projectId; // cleanup the newest one
  });

  it('refuses without a client name', async () => {
    const result = await createOrderFromQuoteAction({ quoteId, clientName: '  ' });
    expect(result.ok).toBe(false);
  });
});
