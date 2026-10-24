import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'file:./local.db';
const isRemote = url.startsWith('libsql://') || url.startsWith('https://');

// Local file -> sqlite dialect. Turso (libsql://) -> turso dialect, same ORM.
export default defineConfig(
  isRemote
    ? {
        dialect: 'turso',
        schema: './db/schema.ts',
        out: './db/migrations',
        dbCredentials: { url, authToken: process.env.DATABASE_AUTH_TOKEN },
      }
    : {
        dialect: 'sqlite',
        schema: './db/schema.ts',
        out: './db/migrations',
        dbCredentials: { url },
      },
);
