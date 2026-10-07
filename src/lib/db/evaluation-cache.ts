import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Conversation } from "@/lib/schemas/dataset";
import type { ConversationReport, Language } from "@/lib/schemas/report";
import type { RubricContent } from "@/lib/schemas/rubric";
import { getDb } from "./index";
import { evaluationCache } from "./schema";

/** Stable JSON: object keys sorted, so semantically equal inputs hash the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function cacheKey(parts: {
  conversation: Conversation;
  rubric: RubricContent;
  modelId: string;
  language: Language;
  judgeVersion: string;
}): string {
  return createHash("sha256").update(canonical(parts)).digest("hex");
}

// The cache is an optimisation: if the database is unavailable we evaluate normally.

export async function readCachedReport(key: string): Promise<ConversationReport | null> {
  try {
    const [row] = await getDb()
      .select({ report: evaluationCache.report })
      .from(evaluationCache)
      .where(eq(evaluationCache.key, key));
    return row?.report ?? null;
  } catch (error) {
    console.warn("evaluation cache read failed", error);
    return null;
  }
}

export async function writeCachedReport(key: string, report: ConversationReport): Promise<void> {
  try {
    await getDb()
      .insert(evaluationCache)
      .values({ key, conversationId: report.conversationId, report })
      .onConflictDoUpdate({ target: evaluationCache.key, set: { report, createdAt: new Date() } });
  } catch (error) {
    console.warn("evaluation cache write failed", error);
  }
}
