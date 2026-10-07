import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { parseRules, type AgentSpec } from "@/lib/schemas/dataset";
import type { Language } from "@/lib/schemas/report";
import {
  RubricContentSchema,
  type EvaluationMethod,
  type RubricContent,
} from "@/lib/schemas/rubric";

import { withRateLimitRetry } from "@/lib/llm/retry";

const LANGUAGE_NAME: Record<Language, string> = { es: "Spanish", en: "English" };

// Flat shape: discriminated unions are not supported equally well by every
// provider's structured-output mode, so we map to the real schema in code.
const DraftSchema = z.object({
  rules: z.array(
    z.object({
      ruleId: z.string(),
      subRules: z.array(
        z.object({
          description: z.string(),
          severity: z.enum(["minor", "severe"]),
          method: z.enum(["llm", "customer_field_equals", "date_within_window"]),
          field: z.string().nullable(),
          valueType: z.enum(["text", "number", "date"]).nullable(),
          minDaysAfterCall: z.int().nullable(),
          maxDaysAfterCall: z.int().nullable(),
          extract: z.string().nullable(),
        }),
      ),
    }),
  ),
});
type DraftSubRule = z.infer<typeof DraftSchema>["rules"][number]["subRules"][number];

const SYSTEM_PROMPT = `You design audit rubrics for voice/chat AI agents.
Given an agent's business rules, split each rule into the smallest independently checkable
sub-rules (usually 1–4). A rule passes only if all its applicable sub-rules pass, so each
sub-rule must describe ONE observable behaviour in a single call transcript.

Guidelines:
- Write conditional sub-rules starting with "If…" / "Si…" so they can be "not applicable"
  when the situation does not occur in the call.
- Severity: "severe" for privacy/security breaches, wrong financial information, unauthorised
  commitments, threats or legal/regulatory exposure; "minor" for courtesy, protocol or wording gaps.
- Method "llm" for anything that needs interpretation (tone, intent, whether something was said).
- Method "customer_field_equals" ONLY when the rule requires a value said in the call to match a
  customer data field exactly (amounts, dates, ID digits). Set "field" to one of the available
  customer data fields, "valueType", and "extract": an instruction telling an LLM exactly what value
  to pull from the transcript and in which format, returning null when absent.
- Method "date_within_window" ONLY for rules bounding a date relative to the call date. Set
  minDaysAfterCall / maxDaysAfterCall (inclusive) and "extract" (ISO date YYYY-MM-DD, null if absent).
- For "llm" sub-rules set field, valueType, min/max and extract to null.`;

function toMethod(sub: DraftSubRule, fields: Set<string>): EvaluationMethod | null {
  if (sub.method === "llm") return { type: "llm" };
  if (!sub.extract) return null;
  if (sub.method === "customer_field_equals") {
    if (!sub.field || !fields.has(sub.field) || !sub.valueType) return null;
    return {
      type: "code",
      check: {
        check: "customer_field_equals",
        field: sub.field,
        valueType: sub.valueType,
        extract: sub.extract,
      },
    };
  }
  if (sub.minDaysAfterCall === null || sub.maxDaysAfterCall === null) return null;
  return {
    type: "code",
    check: {
      check: "date_within_window",
      minDaysAfterCall: sub.minDaysAfterCall,
      maxDaysAfterCall: sub.maxDaysAfterCall,
      extract: sub.extract,
    },
  };
}

export async function generateRubricDraft(params: {
  model: LanguageModel;
  agentSpec: AgentSpec;
  customerFields: string[];
  language: Language;
}): Promise<{ content: RubricContent; warnings: string[] }> {
  const { model, agentSpec, customerFields, language } = params;
  const rules = parseRules(agentSpec.reglas);
  const fields = new Set(customerFields);

  const prompt = [
    `Agent: ${agentSpec.nombre_agente ?? "(unknown)"} — ${agentSpec.empresa ?? ""}`,
    agentSpec.objetivo ? `Objective: ${agentSpec.objetivo}` : "",
    `Available customer data fields: ${customerFields.join(", ") || "(none)"}`,
    "",
    "Rules:",
    ...rules.map((r) => `${r.id}. ${r.text}`),
    "",
    `Return one entry per rule, using the same ruleId. Write descriptions and extract instructions in ${LANGUAGE_NAME[language]}.`,
  ].join("\n");

  let draft: z.infer<typeof DraftSchema> | null = null;
  for (let attempt = 1; attempt <= 2 && !draft; attempt++) {
    try {
      ({ output: draft } = await withRateLimitRetry(() =>
        generateText({
          model,
          system: SYSTEM_PROMPT,
          prompt,
          output: Output.object({ schema: DraftSchema }),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(120_000),
        }),
      ));
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error) || attempt === 2) throw error;
    }
  }

  const warnings: string[] = [];
  const byId = new Map(draft!.rules.map((r) => [r.ruleId, r]));
  const content: RubricContent = {
    agent: {
      name: agentSpec.nombre_agente,
      company: agentSpec.empresa,
      channel: agentSpec.canal,
      objective: agentSpec.objetivo,
    },
    rules: rules.map((rule) => {
      const proposed = byId.get(rule.id)?.subRules ?? [];
      const subRules = proposed.map((sub, i) => {
        let method = toMethod(sub, fields);
        if (!method) {
          warnings.push(
            `${rule.id}.${i + 1}: proposed code check was incomplete or used an unknown field; switched to LLM.`,
          );
          method = { type: "llm" };
        }
        return { id: `${rule.id}.${i + 1}`, description: sub.description, severity: sub.severity, method };
      });
      if (subRules.length === 0) {
        warnings.push(`${rule.id}: no sub-rules proposed; added one covering the whole rule.`);
        subRules.push({ id: `${rule.id}.1`, description: rule.text, severity: "minor", method: { type: "llm" } });
      }
      return { id: rule.id, text: rule.text, subRules };
    }),
  };

  return { content: RubricContentSchema.parse(content), warnings };
}
