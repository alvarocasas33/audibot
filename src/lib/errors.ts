/** Errors that map to a specific HTTP status with a message safe to show to callers. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, details);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
