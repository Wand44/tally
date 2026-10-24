import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { checkRateLimit } from './rate-limit';

const { rateLimits } = schema;
const key = `test:rate-limit:${Date.now()}`;

afterAll(async () => {
  await getDb().delete(rateLimits).where(eq(rateLimits.key, key));
});

describe('checkRateLimit', () => {
  it('allows the runs up to the limit and blocks the next one', async () => {
    expect((await checkRateLimit(key, 2)).allowed).toBe(true);
    expect((await checkRateLimit(key, 2)).allowed).toBe(true);
    expect((await checkRateLimit(key, 2)).allowed).toBe(false);
  });

  it('counts every call of the same key', async () => {
    const first = await checkRateLimit(`${key}:count`, 1);
    const second = await checkRateLimit(`${key}:count`, 1);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });

  it('says when the allowance comes back', async () => {
    const result = await checkRateLimit(`${key}:reset`, 5);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
