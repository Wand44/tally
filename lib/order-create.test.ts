import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { createOrderAction } from '@/app/actions';

// No Next runtime in tests; cache revalidation is a no-op here.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { clients, projects } = schema;

const tag = `test:create-order:${Date.now()}`;
const createdProjectIds: string[] = [];
const createdClientNames = [`${tag} New Client`, `${tag} Existing`];

afterAll(async () => {
  const db = getDb();
  for (const id of createdProjectIds) {
    await db.delete(projects).where(eq(projects.id, id));
  }
  for (const name of createdClientNames) {
    await db.delete(clients).where(eq(clients.name, name));
  }
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe('createOrderAction', () => {
  it('creates a client and an active project from a new client name', async () => {
    const result = await createOrderAction(
      { ok: false },
      form({ title: `${tag} render pack`, clientId: '', newClient: createdClientNames[0], agreedPrice: '1500', hours: '30' }),
    );
    expect(result.ok).toBe(true);

    const db = getDb();
    const [client] = await db.select().from(clients).where(eq(clients.name, createdClientNames[0]));
    expect(client).toBeTruthy();
    const [project] = await db.select().from(projects).where(eq(projects.title, `${tag} render pack`));
    expect(project.clientId).toBe(client.id);
    expect(project.agreedPriceCents).toBe(150000);
    expect(project.status).toBe('active');
    createdProjectIds.push(project.id);
  });

  it('reuses an existing client when one is picked', async () => {
    const db = getDb();
    await db.insert(clients).values({ id: `${tag}:existing`, name: createdClientNames[1], createdAt: new Date() });

    const result = await createOrderAction(
      { ok: false },
      form({ title: `${tag} motion intro`, clientId: `${tag}:existing`, newClient: '', agreedPrice: '900', hours: '12' }),
    );
    expect(result.ok).toBe(true);
    const [project] = await db.select().from(projects).where(eq(projects.title, `${tag} motion intro`));
    expect(project.clientId).toBe(`${tag}:existing`);
    createdProjectIds.push(project.id);
  });

  it('rejects when neither a client nor a new name is given', async () => {
    const result = await createOrderAction(
      { ok: false },
      form({ title: `${tag} orphan`, clientId: '', newClient: '', agreedPrice: '100', hours: '1' }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors?.clientId).toBeTruthy();
  });
});
