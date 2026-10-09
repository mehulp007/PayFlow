import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { openDatabase, type Database } from '../src/db/client.js';
import { ensureDemoTenant } from '../src/modules/organizations/service.js';

export const TEST_PASSWORD = 'Test-Password-2026!';
export const SEED_SIZE = 120;

export interface Response<T = any> {
  status: number;
  body: T;
  text: string;
}
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface TestContext {
  app: FastifyInstance;
  database: Database;
  login(username: string, password?: string): Promise<string>;
  call<T = any>(token: string | null, method: Method, url: string, body?: unknown): Promise<Response<T>>;
  /** The id of the organization's latest run, as the signed-in user sees it. */
  currentRunId(token: string): Promise<string>;
  /** Creates another organization through public sign-up and returns its admin's token. */
  signup(name: string, start: 'empty' | 'sample', email?: string): Promise<{ token: string; organization: any }>;
  close(): Promise<void>;
}

/** Boots the real app on an in-memory database with a small Aster Group demo tenant. */
export async function createTestContext(): Promise<TestContext> {
  const database = await openDatabase({ dataDirectory: 'memory' });
  await ensureDemoTenant(database.db, { size: SEED_SIZE, password: TEST_PASSWORD });
  const app = await buildApp({ db: database.db, loginRateLimit: 10_000, signupRateLimit: 10_000 });

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
  const currentRunId = async (token: string) => (await call(token, 'GET', '/api/bootstrap')).body.currentRun.id;
  const signup: TestContext['signup'] = async (name, start, email) => {
    const response = await call(null, 'POST', '/api/organizations', {
      organizationName: name,
      adminName: 'Test Admin',
      email: email ?? `${name.toLowerCase().replace(/\W+/g, '.')}@example.com`,
      password: TEST_PASSWORD,
      branches: [
        { name: 'Pune', state: 'Maharashtra' },
        { name: 'Mysuru', state: 'Karnataka' },
      ],
      payGroups: ['Staff', 'Plant'],
      start,
    });
    if (response.status !== 200) throw new Error(`Sign-up failed: ${response.text}`);
    return { token: response.body.token, organization: response.body.organization };
  };
  return {
    app,
    database,
    call,
    login,
    currentRunId,
    signup,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export const employeeId = (n: number) => `EMP${String(n).padStart(5, '0')}`;
/** The seeded new joiners without bank details: the last twelve people of a sample company. */
export const newJoiners = (size: number) => Array.from({ length: 12 }, (_, index) => employeeId(size - 11 + index));
