import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';
import { ensureDemoTenant } from './modules/organizations/service.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'This build contains demo accounts and unreviewed statutory interpretations. Production mode is disabled.',
  );
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dataRoot = resolve(repositoryRoot, 'data');
const dataDirectory = process.env.PAYFLOW_DATA_DIRECTORY ?? resolve(dataRoot, 'payflow');
const demoSize = Number(process.env.PAYFLOW_SEED_SIZE ?? 8420);

const database = await openDatabase({ url: process.env.DATABASE_URL, dataDirectory });
const created = await ensureDemoTenant(database.db, {
  size: demoSize,
  password: process.env.PAYFLOW_DEMO_PASSWORD,
  credentialFile: process.env.PAYFLOW_DEMO_PASSWORD ? undefined : resolve(dataRoot, 'individual-demo-credentials.txt'),
});
if (created) console.log(`Created the Aster Group demo tenant (${demoSize} people)`);

const app = await buildApp({
  db: database.db,
  logger: true,
  // Automated end-to-end runs sign in many times a minute; real use keeps the default limits.
  loginRateLimit: process.env.PAYFLOW_LOGIN_RATE_LIMIT ? Number(process.env.PAYFLOW_LOGIN_RATE_LIMIT) : undefined,
});
const shutdown = async () => {
  await app.close();
  await database.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
await app.listen({ port: Number(process.env.PORT ?? 4000), host: process.env.HOST ?? '127.0.0.1' });
