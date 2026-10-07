import { APICallError, RetryError } from "ai";

export class QuotaExhaustedError extends Error {}

const MAX_ATTEMPTS = 6;
/** Waits longer than this mean a daily quota, not a per-minute limit: fail fast. */
const MAX_WAIT_MS = 65_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function unwrap(error: unknown): unknown {
  return RetryError.isInstance(error) ? error.lastError : error;
}

/** Reads the provider's requested wait: Retry-After header, or Google's "retry in 22.2s" body. */
export function requestedWaitMs(error: APICallError): number | null {
  const header = error.responseHeaders?.["retry-after"];
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;
  const text = `${error.message} ${error.responseBody ?? ""}`;
  const seconds = text.match(/retry in ((?:\d+h)?(?:\d+m)?[\d.]+)s/i)?.[1];
  if (seconds) {
    const [, h = "0", m = "0", s = "0"] = seconds.match(/(?:(\d+)h)?(?:(\d+)m)?([\d.]+)/) ?? [];
    return ((+h * 60 + +m) * 60 + +s) * 1000;
  }
  const delay = text.match(/"retryDelay":\s*"([\d.]+)s"/)?.[1];
  return delay ? Number(delay) * 1000 : null;
}

/**
 * Retries rate-limit (429) and overload (5xx) errors, honouring the wait the provider asks for.
 * Daily-quota errors are not retried: waiting hours inside a request helps nobody.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (raw) {
      const error = unwrap(raw);
      if (!APICallError.isInstance(error) || !error.isRetryable || attempt >= MAX_ATTEMPTS) {
        throw error;
      }
      const backoff = 2000 * 2 ** (attempt - 1);
      const requested = error.statusCode === 429 ? requestedWaitMs(error) : null;
      if (requested !== null && requested > MAX_WAIT_MS) {
        throw new QuotaExhaustedError(
          "The model's quota is exhausted for now (provider asks to wait " +
            `${Math.round(requested / 60_000)} min). Try another model or later.`,
        );
      }
      await sleep((requested ?? backoff) + Math.random() * 1000);
    }
  }
}
