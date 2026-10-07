import { afterEach, describe, expect, it } from "vitest";
import { requireApiKey } from "./auth";

const request = (authorization?: string) =>
  new Request("https://audibot.test/api/models", {
    headers: authorization ? { authorization } : {},
  });

const statusOf = (fn: () => void) => {
  try {
    fn();
    return 200;
  } catch (error) {
    return (error as { status: number }).status;
  }
};

describe("requireApiKey", () => {
  afterEach(() => {
    delete process.env.AUDIBOT_API_KEYS;
  });

  it("fails closed when no keys are configured", () => {
    expect(statusOf(() => requireApiKey(request("Bearer anything")))).toBe(503);
  });

  it("rejects missing, malformed and wrong keys", () => {
    process.env.AUDIBOT_API_KEYS = "sk_one";
    expect(statusOf(() => requireApiKey(request()))).toBe(401);
    expect(statusOf(() => requireApiKey(request("sk_one")))).toBe(401);
    expect(statusOf(() => requireApiKey(request("Bearer sk_two")))).toBe(401);
  });

  it("accepts any configured key (rotation)", () => {
    process.env.AUDIBOT_API_KEYS = "sk_old, sk_new";
    expect(statusOf(() => requireApiKey(request("Bearer sk_old")))).toBe(200);
    expect(statusOf(() => requireApiKey(request("bearer sk_new")))).toBe(200);
  });
});
