import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

export const databaseUrl = process.env.DATABASE_URL ?? 'file:./local.db';

let client: Client | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** One libSQL client per process, reused across server components and scripts. */
export function getDb() {
  if (!db) {
    client = createClient({ url: databaseUrl, authToken: process.env.DATABASE_AUTH_TOKEN });
    // Writes wait up to 5s when another process holds the file (dev server + tests).
    void client.execute('PRAGMA busy_timeout = 5000').catch(() => {});
    db = drizzle(client, { schema });
  }
  return db;
}

export { schema };
