import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';

const { rateLimits } = schema;

/**
 * How many AI runs one client may do per hour. Override with
 * AI_RUNS_PER_HOUR in the environment; 20 is the safe demo default.
 */
const envLimit = Number(process.env.AI_RUNS_PER_HOUR);
export const DEFAULT_LIMIT = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 20;

const WINDOW_MS = 60 * 60 * 1000;

export interface RateLimitResult {
  /** False when the client used up its allowance. */
  allowed: boolean;
  limit: number;
  /** When the window ends and the allowance comes back. */
  resetAt: number;
}

/**
 * Count one use of a key and say whether it is still allowed (PRD F8).
 *
 * The counter lives in the database, so the limit also holds when the app
 * runs on more than one serverless instance.
 */
export async function checkRateLimit(key: string, limit: number = DEFAULT_LIMIT): Promise<RateLimitResult> {
  const db = getDb();
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const id = `${key}:${windowStart}`;

  await db
    .insert(rateLimits)
    .values({ id, key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.id,
      set: { count: sql`${rateLimits.count} + 1` },
    });

  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.id, id)).limit(1);

  return {
    allowed: (row?.count ?? 1) <= limit,
    limit,
    resetAt: windowStart + WINDOW_MS,
  };
}
