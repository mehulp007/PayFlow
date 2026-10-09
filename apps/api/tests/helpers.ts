import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { openDatabase, type Database } from '../src/db/client.js';
import { DEMO_RUN_ID, seedDemoCompany } from '../src/db/seed.js';
import { seedDemoAccounts } from '../src/modules/auth/service.js';

export const TEST_PASSWORD = 'Test-Password-2026!';
export const RUN = `/api/runs/${DEMO_RUN_ID}`;
export const SEED_SIZE = 120;

export interface Response<T = any> {
  status: number;
  body: T;
  text: string;
}
export interface TestContext {
  app: FastifyInstance;
  database: Database;
  login(username: string, password?: string): Promise<string>;
  call<T = any>(
    token: string | null,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
  ): Promise<Response<T>>;
  close(): Promise<void>;
}

/** Boots the real app on an in-memory database seeded with a small demo company. */
export async function createTestContext(): Promise<TestContext> {
  const database = await openDatabase({ dataDirectory: 'memory' });
  await seedDemoCompany(database.db, SEED_SIZE);
  await seedDemoAccounts(database.db, { password: TEST_PASSWORD });
  const app = await buildApp({ db: database.db, loginRateLimit: 10_000 });

  const call: TestContext['call'] = async (token, method, url, body) => {
    const response = await app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body === undefined ? {} : { payload: body as object }),
    });
    let parsed: unknown = undefined;
    try {
      parsed = response.json();
    } catch {
      parsed = undefined;
    }
    return { status: response.statusCode, body: parsed as never, text: response.body };
  };
  const login = async (username: string, password = TEST_PASSWORD) => {
    const response = await call(null, 'POST', '/api/auth/login', { username, password });
    if (response.status !== 200) throw new Error(`Login failed for ${username}: ${response.text}`);
    return response.body.token as string;
  };
  return {
    app,
    database,
    call,
    login,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export const employeeId = (n: number) => `EMP${String(n).padStart(5, '0')}`;
