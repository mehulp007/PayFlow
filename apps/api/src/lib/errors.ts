import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message = 'Please sign in') => new HttpError(401, message);
export const forbidden = (message = 'This role cannot perform that action') => new HttpError(403, message);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

/** Parses untrusted input with a Zod schema, turning failures into a 400 with field-level issues. */
export function validate<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
  const first = issues[0];
  throw new HttpError(400, first.path ? `${first.path}: ${first.message}` : first.message, issues);
}
