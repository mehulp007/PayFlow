import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';
import { acquireDataLock } from './lock.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export interface Database {
  db: Db;
  /** Where the data lives, for messages: a folder, "memory", or "postgres". */
  location: string;
  close(): Promise<void>;
}

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/**
 * Opens PostgreSQL when a connection string is given, otherwise embedded PGlite: in a folder for
 * development, or in memory for tests. Pending migrations are applied before the database is returned.
 */
export async function openDatabase(options: { url?: string; dataDirectory?: string | 'memory' }): Promise<Database> {
  if (options.url) {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({ connectionString: options.url, max: 5, connectionTimeoutMillis: 10_000 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    return { db: db as unknown as Db, location: 'postgres', close: () => pool.end() };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const directory = options.dataDirectory ?? 'memory';
  let client: InstanceType<typeof PGlite>;
  if (directory === 'memory') client = new PGlite();
  else {
    await mkdir(directory, { recursive: true });
    await acquireDataLock(resolve(dirname(directory), 'payflow-api.lock'));
    client = new PGlite(directory);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Db, location: directory, close: () => client.close() };
}
