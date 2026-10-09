import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';
import { seedDemoCompany } from './db/seed.js';
import { seedDemoAccounts } from './modules/auth/service.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'This build contains demo accounts and unreviewed statutory interpretations. Production mode is disabled.',
  );
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dataRoot = resolve(repositoryRoot, 'data');
const dataDirectory = process.env.PAYFLOW_DATA_DIRECTORY ?? resolve(dataRoot, 'db');
const seedSize = Number(process.env.PAYFLOW_SEED_SIZE ?? 8420);

const database = await openDatabase({ url: process.env.DATABASE_URL, dataDirectory });
if (await seedDemoCompany(database.db, seedSize))
  console.log(`Seeded the Aster Group demo company (${seedSize} people)`);
await seedDemoAccounts(database.db, {
  password: process.env.PAYFLOW_DEMO_PASSWORD,
  credentialFile: process.env.PAYFLOW_DEMO_PASSWORD ? undefined : resolve(dataRoot, 'individual-demo-credentials.txt'),
});

const app = await buildApp({ db: database.db, logger: true });
const shutdown = async () => {
  await app.close();
  await database.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
await app.listen({ port: Number(process.env.PORT ?? 4000), host: process.env.HOST ?? '127.0.0.1' });
