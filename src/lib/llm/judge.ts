import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { Conversation } from "@/lib/schemas/dataset";
import type { Language } from "@/lib/schemas/report";
import type { RubricContent, SubRule } from "@/lib/schemas/rubric";
import { QuotaExhaustedError, withRateLimitRetry } from "./retry";

/** Bump when the prompt or answer schema changes, so cached evaluations are not reused. */
export const JUDGE_VERSION = "4";

export interface RawSubRuleAnswer {
  reasoning: string;
  turns: number[];
  /** Present for LLM-judged sub-rules. */
  verdict?: "passed" | "failed" | "not_applicable";
  /** Present for code-checked sub-rules: the value extracted for code to compare. */
  value?: string | null;
}

export interface JudgeResult {
  answers: Map<string, RawSubRuleAnswer>;
  warnings: string[];
  attempts: number;
  /** This conversation's share of the tokens spent on its (possibly grouped) request, retries included. */
  usage: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export class JudgeError extends Error {}

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 120_000;

const LANGUAGE_NAME: Record<Language, string> = { es: "Spanish", en: "English" };

const SYSTEM_PROMPT = `You are a meticulous quality auditor for a voice AI agent deployed by a company.
You audit call transcripts against a rubric made of sub-rules. For EACH call, return an entry in
"calls" with its callId and exactly one answer per sub-rule key (subRuleId) — no key may be missing.

There are two kinds of sub-rules:

1. JUDGE sub-rules: decide a "verdict" (set "value" to null).
   - "passed": the situation the sub-rule covers happened and the agent complied.
   - "failed": the agent violated the sub-rule. Omissions count: if the sub-rule applies and the
     required behaviour never happened, it failed.
   - "not_applicable": the sub-rule is conditional ("Si…", "If…", "Cuando…") and its condition did
     NOT occur in this call. Never answer "passed" for a conditional sub-rule whose condition did not
     occur. Sub-rules without a condition always apply.

2. EXTRACT sub-rules: do NOT judge (set "verdict" to null). Put in "value" what the sub-rule
   describes, in the exact format requested, or null if it does not appear. Code will compare it against the customer data.
   Convert spoken numbers and dates (e.g. "un millón doscientos mil" -> 1200000,
   "uno, tres, cinco, dos" -> 1352, "el sábado 26" -> the ISO date using the call date).
   Extract ONLY what was literally said in the transcript. NEVER take or "correct" the value from
   the customer data: mismatches between what was said and the customer data are exactly what is
   being audited. Start "reasoning" by quoting the exact words said, then give the conversion.

Evidence ("turns"): cite turn numbers from the transcript.
- For "failed": ALWAYS cite at least one turn — the violating turn, or for an omission the agent
  turn where the behaviour should have happened (e.g. the opening or the closing turn).
- For "passed": cite the turn(s) that show compliance.
- For extracted values: cite the turn where the value was said.
- "not_applicable" or null values may cite nothing.

Judge only what is in the transcript. Lines from "sistema" describe call events (hang-ups, transfers).
Be literal and consistent: the same behaviour must get the same verdict in every call.
Keep "reasoning" to one or two sentences that refer to what was actually said.`;

/** JSON keys must be simple for every provider; map "R1.1" -> "R1_1". */
function answerKey(subRule: SubRule, index: number, used: Set<string>): string {
  let key = subRule.id.replace(/[^A-Za-z0-9_]/g, "_");
  if (used.has(key)) key = `${key}__${index}`;
  used.add(key);
  return key;
}

/**
 * Fixed-size answer schema: an array of answers tagged by sub-rule key, not one property per
 * sub-rule. Its grammar doesn't grow with the rubric (Anthropic rejects large compiled grammars);
 * completeness is enforced in code instead (see readAnswers).
 */
function buildSchema(subRuleKeys: string[], callKeys: string[]) {
  const answer = z.object({
    subRuleId: z.enum(subRuleKeys as [string, ...string[]]),
    reasoning: z.string(),
    turns: z.array(z.int()).describe("Transcript turn numbers that support the answer"),
    verdict: z
      .enum(["passed", "failed", "not_applicable"])
      .nullable()
      .describe("JUDGE sub-rules only; null for EXTRACT"),
    value: z.string().nullable().describe("EXTRACT sub-rules only: the extracted value, or null if absent"),
  });
  return z.object({
    calls: z.array(z.object({ callId: z.enum(callKeys as [string, ...string[]]), answers: z.array(answer) })),
  });
}

interface AnswerItem {
  subRuleId: string;
  reasoning: string;
  turns: number[];
  verdict: "passed" | "failed" | "not_applicable" | null;
  value: string | null;
}

/** Maps one call's answers to sub-rule ids; returns the keys that are missing or incomplete. */
function readAnswers(
  items: AnswerItem[],
  keyed: { key: string; subRule: SubRule }[],
): { answers: Map<string, RawSubRuleAnswer>; missing: string[] } {
  const byKey = new Map<string, AnswerItem>();
  for (const item of items) if (!byKey.has(item.subRuleId)) byKey.set(item.subRuleId, item);
  const answers = new Map<string, RawSubRuleAnswer>();
  const missing: string[] = [];
  for (const { key, subRule } of keyed) {
    const item = byKey.get(key);
    if (!item || (subRule.method.type === "llm" && !item.verdict)) {
      missing.push(key);
      continue;
    }
    answers.set(subRule.id, {
      reasoning: item.reasoning,
      turns: item.turns,
      ...(subRule.method.type === "llm" ? { verdict: item.verdict! } : { value: item.value }),
    });
  }
  return { answers, missing };
}

function formatTranscript(conversation: Conversation): string {
  return conversation.transcripcion
    .map((turn, i) => `[${i + 1}] ${turn.hablante}: ${turn.texto}`)
    .join("\n");
}

function buildPrompt(
  rubric: RubricContent,
  group: { key: string; conversation: Conversation }[],
  keyed: { key: string; ruleId: string; subRule: SubRule }[],
  language: Language,
): string {
  const agent = rubric.agent;
  const agentLines = [
    agent.name && `Name: ${agent.name}`,
    agent.company && `Company: ${agent.company}`,
    agent.channel && `Channel: ${agent.channel}`,
    agent.objective && `Objective: ${agent.objective}`,
  ].filter(Boolean);

  const subRuleLines = keyed.map(({ key, ruleId, subRule }) =>
    subRule.method.type === "llm"
      ? `- ${key} (rule ${ruleId}) JUDGE: ${subRule.description}`
      : `- ${key} (rule ${ruleId}) EXTRACT: ${subRule.method.check.extract}`,
  );

  const calls = group.flatMap(({ key, conversation }) => [
    `## Call ${key}`,
    `Call date: ${conversation.fecha_llamada}`,
    `Customer data available to the agent: ${JSON.stringify(conversation.datos_cliente)}`,
    "Transcript:",
    formatTranscript(conversation),
    "",
  ]);

  return [
    "## Agent",
    ...(agentLines.length ? agentLines : ["(no profile provided)"]),
    "",
    "## Business rules (full text, for context)",
    ...rubric.rules.map((r) => `${r.id}. ${r.text}`),
    "",
    ...calls,
    "## Sub-rules to answer for EACH call (use these exact keys)",
    ...subRuleLines,
    "",
    group.length > 1
      ? `Evaluate each call independently: never use one call's content to judge another. Turn numbers refer to that call's own transcript.`
      : "",
    `Write every "reasoning" in ${LANGUAGE_NAME[language]}.`,
  ].join("\n");
}

/** Returns a human-readable problem with the answers, or null when they are usable. */
function findProblem(
  answers: Map<string, RawSubRuleAnswer>,
  turnCount: number,
): string | null {
  for (const [id, answer] of answers) {
    const valid = answer.turns.filter((t) => t >= 1 && t <= turnCount);
    if (answer.verdict === "failed" && valid.length === 0) {
      return `sub-rule ${id} failed without citing a valid transcript turn.`;
    }
    if (answer.value != null && answer.value !== "" && valid.length === 0) {
      return `sub-rule ${id} extracted a value without citing a valid transcript turn.`;
    }
  }
  return null;
}

/**
 * Evaluates a group of conversations in ONE model request (group size is a setting:
 * fewer requests vs. less context per call). Returns results in input order.
 */
export async function judgeConversations(params: {
  model: LanguageModel;
  rubric: RubricContent;
  conversations: Conversation[];
  language: Language;
}): Promise<JudgeResult[]> {
  const { model, rubric, conversations, language } = params;
  const used = new Set<string>();
  const keyed = rubric.rules
    .flatMap((rule) => rule.subRules.map((subRule) => ({ ruleId: rule.id, subRule })))
    .map((entry, i) => ({ ...entry, key: answerKey(entry.subRule, i, used) }));
  const group = conversations.map((conversation, i) => ({ key: `call_${i + 1}`, conversation }));

  const schema = buildSchema(
    keyed.map((k) => k.key),
    group.map((g) => g.key),
  );
  const prompt = buildPrompt(rubric, group, keyed, language);
  let lastError = "unknown error";
  let feedback = "";
  const spent: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { output, usage } = await withRateLimitRetry(() =>
        generateText({
          model,
          system: SYSTEM_PROMPT,
          prompt: prompt + feedback,
          output: Output.object({ schema }),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS * group.length),
        }),
      );

      spent.inputTokens += usage.inputTokens ?? 0;
      spent.outputTokens += usage.outputTokens ?? 0;

      const { calls } = output as { calls: { callId: string; answers: AnswerItem[] }[] };
      const results = group.map(({ key, conversation }) => {
        const items = calls.filter((c) => c.callId === key).flatMap((c) => c.answers);
        const { answers, missing } = readAnswers(items, keyed);
        const problem = missing.length
          ? `missing or incomplete answers for ${missing.join(", ")}`
          : findProblem(answers, conversation.transcripcion.length);
        return { key, answers, missing, problem };
      });

      const problems = results.filter((r) => r.problem).map((r) => `${r.key}: ${r.problem}`);
      if (problems.length && attempt < MAX_ATTEMPTS) {
        lastError = problems.join("; ");
        feedback = `\n\nYour previous answer was rejected (${lastError}). Fix it and answer again.`;
        continue;
      }
      // Missing answers can't be scored; uncited evidence only becomes a warning.
      if (results.some((r) => r.missing.length)) {
        throw new JudgeError(`LLM evaluation incomplete: ${problems.join("; ")}`);
      }
      return results.map(({ answers, problem }) => ({
        answers,
        warnings: problem ? [problem] : [],
        attempts: attempt,
        usage: {
          inputTokens: Math.round(spent.inputTokens / group.length),
          outputTokens: Math.round(spent.outputTokens / group.length),
        },
      }));
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        lastError = "the model returned output that does not match the schema";
        continue;
      }
      if (error instanceof QuotaExhaustedError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      // API errors were already retried by withRateLimitRetry; don't multiply them.
      break;
    }
  }
  throw new JudgeError(`LLM evaluation failed: ${lastError}`);
}
