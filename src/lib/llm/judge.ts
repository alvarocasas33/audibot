import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { Conversation } from "@/lib/schemas/dataset";
import type { Language } from "@/lib/schemas/report";
import type { RubricContent, SubRule } from "@/lib/schemas/rubric";
import { QuotaExhaustedError, withRateLimitRetry } from "./retry";

/** Bump when the prompt or answer schema changes, so cached evaluations are not reused. */
export const JUDGE_VERSION = "2";

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
}

export class JudgeError extends Error {}

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 120_000;

const LANGUAGE_NAME: Record<Language, string> = { es: "Spanish", en: "English" };

const SYSTEM_PROMPT = `You are a meticulous quality auditor for a voice AI agent deployed by a company.
You audit ONE call transcript against a rubric made of sub-rules and return one answer per sub-rule.

There are two kinds of sub-rules:

1. JUDGE sub-rules: decide a verdict.
   - "passed": the situation the sub-rule covers happened and the agent complied.
   - "failed": the agent violated the sub-rule. Omissions count: if the sub-rule applies and the
     required behaviour never happened, it failed.
   - "not_applicable": the sub-rule is conditional ("Si…", "If…", "Cuando…") and its condition did
     NOT occur in this call. Never answer "passed" for a conditional sub-rule whose condition did not
     occur. Sub-rules without a condition always apply.

2. EXTRACT sub-rules: do NOT judge. Extract the value the sub-rule describes, in the exact format
   requested, or null if it does not appear. Code will compare it against the customer data.
   Convert spoken numbers and dates (e.g. "un millón doscientos mil" -> 1200000,
   "uno, tres, cinco, dos" -> 1352, "el sábado 26" -> the ISO date using the call date).

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

function buildSchema(subRules: { key: string; subRule: SubRule }[]) {
  const turns = z
    .array(z.int())
    .describe("Transcript turn numbers that support the answer");
  const shape: Record<string, z.ZodType> = {};
  for (const { key, subRule } of subRules) {
    shape[key] =
      subRule.method.type === "llm"
        ? z.object({
            reasoning: z.string(),
            turns,
            verdict: z.enum(["passed", "failed", "not_applicable"]),
          })
        : z.object({
            reasoning: z.string(),
            turns,
            value: z.string().nullable().describe("Extracted value, or null if absent"),
          });
  }
  return z.object(shape);
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

  const perCall = buildSchema(keyed);
  const schema = z.object(Object.fromEntries(group.map(({ key }) => [key, perCall])));
  const prompt = buildPrompt(rubric, group, keyed, language);
  let lastError = "unknown error";
  let feedback = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { output } = await withRateLimitRetry(() =>
        generateText({
          model,
          system: SYSTEM_PROMPT,
          prompt: prompt + feedback,
          output: Output.object({ schema }),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS * group.length),
        }),
      );

      const raw = output as Record<string, Record<string, RawSubRuleAnswer>>;
      const results = group.map(({ key, conversation }) => {
        const answers = new Map<string, RawSubRuleAnswer>();
        for (const entry of keyed) answers.set(entry.subRule.id, raw[key][entry.key]);
        const problem = findProblem(answers, conversation.transcripcion.length);
        return { key, answers, problem };
      });

      const problems = results.filter((r) => r.problem).map((r) => `${r.key}: ${r.problem}`);
      if (problems.length && attempt < MAX_ATTEMPTS) {
        lastError = problems.join("; ");
        feedback = `\n\nYour previous answer was rejected (${lastError}). Fix it and answer again.`;
        continue;
      }
      return results.map(({ answers, problem }) => ({
        answers,
        warnings: problem ? [problem] : [],
        attempts: attempt,
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
