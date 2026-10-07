import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/errors";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Valid keys come from AUDIBOT_API_KEYS (comma-separated, so a key can be rotated
 * without downtime). Fails closed: no configured keys means no API access.
 */
function configuredKeys(): Buffer[] {
  return (process.env.AUDIBOT_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .map(digest);
}

/** Throws a 401 unless the request carries `Authorization: Bearer <valid key>`. */
export function requireApiKey(request: Request): void {
  const keys = configuredKeys();
  if (keys.length === 0) {
    throw new HttpError(503, "API authentication is not configured on this server");
  }
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw new HttpError(401, "Missing API key. Send it as: Authorization: Bearer <key>");
  }
  // Compare fixed-length hashes in constant time, against every key, to avoid timing leaks.
  const given = digest(match[1]);
  const valid = keys.reduce((ok, key) => timingSafeEqual(key, given) || ok, false);
  if (!valid) throw new HttpError(401, "Invalid API key");
}
