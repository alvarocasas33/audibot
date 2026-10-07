import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { QuotaExhaustedError, requestedWaitMs, withRateLimitRetry } from "./retry";

const quotaError = (message: string, headers?: Record<string, string>) =>
  new APICallError({
    message,
    url: "https://example.test",
    requestBodyValues: {},
    statusCode: 429,
    responseHeaders: headers,
    isRetryable: true,
  });

describe("requestedWaitMs", () => {
  it("reads Google's per-minute hint", () => {
    expect(requestedWaitMs(quotaError("Please retry in 4.5s."))).toBe(4500);
  });
  it("reads a daily-quota hint with hours and minutes", () => {
    expect(requestedWaitMs(quotaError("Please retry in 19h5m39.5s."))).toBe(((19 * 60 + 5) * 60 + 39.5) * 1000);
  });
  it("prefers the Retry-After header", () => {
    expect(requestedWaitMs(quotaError("retry in 50s", { "retry-after": "3" }))).toBe(3000);
  });
});

describe("withRateLimitRetry", () => {
  it("fails fast when the provider asks to wait for hours", async () => {
    let calls = 0;
    const promise = withRateLimitRetry(async () => {
      calls++;
      throw quotaError("Quota exceeded. Please retry in 19h5m39s.");
    });
    await expect(promise).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect(calls).toBe(1);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withRateLimitRetry(async () => {
        calls++;
        throw new Error("bad request");
      }),
    ).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });
});
