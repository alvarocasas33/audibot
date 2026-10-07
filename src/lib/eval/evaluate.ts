import type { LanguageModel } from "ai";
import { cacheKey, readCachedReport, writeCachedReport } from "@/lib/db/evaluation-cache";
import { JUDGE_VERSION, judgeConversations, type JudgeResult, type RawSubRuleAnswer } from "@/lib/llm/judge";
import { QuotaExhaustedError } from "@/lib/llm/retry";
import type { Conversation } from "@/lib/schemas/dataset";
import type {
  BatchReport,
  ConversationReport,
  Evidence,
  Language,
  SubRuleResult,
} from "@/lib/schemas/report";
import type { RubricContent, SubRule } from "@/lib/schemas/rubric";
import { runCodeCheck } from "./code-checks";
import { aggregate, buildRuleResult, scoreConversation } from "./scoring";

export interface EvaluationContext {
  model: LanguageModel;
  modelId: string;
  rubricName: string;
  rubric: RubricContent;
  language: Language;
  /** Skip the cache lookup and re-run the LLM (the new result is still cached). */
  fresh?: boolean;
}

/** Quotes come from the transcript by turn number, so evidence can never be invented. */
function buildEvidence(conversation: Conversation, turns: number[]): Evidence[] {
  const unique = [...new Set(turns)]
    .filter((t) => Number.isInteger(t) && t >= 1 && t <= conversation.transcripcion.length)
    .sort((a, b) => a - b);
  return unique.map((turn) => {
    const { hablante, texto } = conversation.transcripcion[turn - 1];
    return { turn, speaker: hablante, quote: texto };
  });
}

function buildSubRuleResult(
  subRule: SubRule,
  answer: RawSubRuleAnswer,
  conversation: Conversation,
  language: Language,
  warnings: string[],
): SubRuleResult {
  if (subRule.method.type === "llm") {
    const verdict = answer.verdict ?? "not_applicable";
    return {
      id: subRule.id,
      description: subRule.description,
      method: "llm",
      verdict,
      severity: verdict === "failed" ? subRule.severity : null,
      evidence: verdict === "not_applicable" ? [] : buildEvidence(conversation, answer.turns),
      explanation: answer.reasoning,
    };
  }

  const outcome = runCodeCheck(subRule.method.check, answer.value ?? null, conversation, language);
  if (outcome.warning) warnings.push(`${subRule.id}: ${outcome.warning}`);
  return {
    id: subRule.id,
    description: subRule.description,
    method: "code",
    verdict: outcome.verdict,
    severity: outcome.verdict === "failed" ? subRule.severity : null,
    evidence: outcome.verdict === "not_applicable" ? [] : buildEvidence(conversation, answer.turns),
    explanation: outcome.explanation,
  };
}

function keyFor(conversation: Conversation, ctx: EvaluationContext): string {
  return cacheKey({
    conversation,
    rubric: ctx.rubric,
    modelId: ctx.modelId,
    language: ctx.language,
    judgeVersion: JUDGE_VERSION,
  });
}

function okReport(
  conversation: Conversation,
  judged: JudgeResult,
  ctx: EvaluationContext,
  durationMs: number,
): ConversationReport {
  const warnings = [...judged.warnings];
  const rules = ctx.rubric.rules.map((rule) =>
    buildRuleResult(
      rule,
      rule.subRules.map((subRule) =>
        buildSubRuleResult(subRule, judged.answers.get(subRule.id)!, conversation, ctx.language, warnings),
      ),
    ),
  );
  const { counts, score, severity } = scoreConversation(rules);
  return {
    conversationId: conversation.id,
    status: "ok",
    score,
    severity,
    counts,
    rules,
    warnings,
    error: null,
    model: ctx.modelId,
    durationMs,
    cached: false,
    usage: judged.usage,
  };
}

/** One broken conversation must never take the batch (or the service) down. */
function errorReport(
  conversation: Conversation,
  error: unknown,
  ctx: EvaluationContext,
  durationMs: number,
): ConversationReport {
  return {
    conversationId: conversation.id,
    status: "error",
    score: null,
    severity: null,
    counts: { passed: 0, failed: 0, notApplicable: 0 },
    rules: [],
    warnings: [],
    error: error instanceof Error ? error.message : String(error),
    model: ctx.modelId,
    durationMs,
    cached: false,
    usage: null,
  };
}

/**
 * Evaluates conversations sharing one model request. If the grouped request fails for a
 * reason other than quota, each conversation is retried alone, so one malformed answer
 * doesn't sink its neighbours.
 */
async function evaluateGroup(
  group: Conversation[],
  ctx: EvaluationContext,
): Promise<ConversationReport[]> {
  const started = Date.now();
  try {
    const judged = await judgeConversations({
      model: ctx.model,
      rubric: ctx.rubric,
      conversations: group,
      language: ctx.language,
    });
    const elapsed = Math.round((Date.now() - started) / group.length);
    return group.map((conversation, i) => okReport(conversation, judged[i], ctx, elapsed));
  } catch (error) {
    if (group.length === 1 || error instanceof QuotaExhaustedError) {
      return group.map((c) => errorReport(c, error, ctx, Date.now() - started));
    }
    const reports: ConversationReport[] = [];
    for (const conversation of group) reports.push(...(await evaluateGroup([conversation], ctx)));
    return reports;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function batchConcurrency(): number {
  const value = Number(process.env.EVAL_CONCURRENCY);
  return Number.isInteger(value) && value > 0 ? value : 4;
}

/**
 * Evaluates conversations: cached results are reused, the rest are sent to the model
 * in groups of `conversationsPerRequest`. Results keep the input order.
 */
export async function evaluateConversations(
  conversations: Conversation[],
  ctx: EvaluationContext,
  conversationsPerRequest: number,
): Promise<ConversationReport[]> {
  const keys = conversations.map((c) => keyFor(c, ctx));
  const reports = new Array<ConversationReport>(conversations.length);
  const pending: number[] = [];

  await Promise.all(
    conversations.map(async (_, i) => {
      const cached = ctx.fresh ? null : await readCachedReport(keys[i]);
      if (cached) reports[i] = { ...cached, cached: true, usage: cached.usage ?? null };
      else pending.push(i);
    }),
  );
  pending.sort((a, b) => a - b);

  const size = Math.max(1, conversationsPerRequest);
  const groups: number[][] = [];
  for (let i = 0; i < pending.length; i += size) groups.push(pending.slice(i, i + size));

  await mapWithConcurrency(groups, batchConcurrency(), async (indexes) => {
    const results = await evaluateGroup(indexes.map((i) => conversations[i]), ctx);
    await Promise.all(
      indexes.map(async (index, j) => {
        reports[index] = results[j];
        // Only successful evaluations are cached; errors should be retried next time.
        if (results[j].status === "ok") await writeCachedReport(keys[index], results[j]);
      }),
    );
  });
  return reports;
}

export async function evaluateConversation(
  conversation: Conversation,
  ctx: EvaluationContext,
): Promise<ConversationReport> {
  const [report] = await evaluateConversations([conversation], ctx, 1);
  return report;
}

export async function evaluateBatch(
  conversations: Conversation[],
  ctx: EvaluationContext,
  conversationsPerRequest: number,
): Promise<BatchReport> {
  const started = Date.now();
  const reports = await evaluateConversations(conversations, ctx, conversationsPerRequest);
  const errorCount = reports.filter((r) => r.status === "error").length;

  return {
    meta: {
      rubric: ctx.rubricName,
      model: ctx.modelId,
      language: ctx.language,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      conversationCount: conversations.length,
      evaluatedCount: reports.length - errorCount,
      errorCount,
      cachedCount: reports.filter((r) => r.cached).length,
      tokenUsage: reports
        .filter((r) => !r.cached && r.usage)
        .reduce(
          (sum, r) => ({
            inputTokens: sum.inputTokens + r.usage!.inputTokens,
            outputTokens: sum.outputTokens + r.usage!.outputTokens,
          }),
          { inputTokens: 0, outputTokens: 0 },
        ),
    },
    summary: aggregate(ctx.rubric.rules, reports),
    conversations: reports,
  };
}
