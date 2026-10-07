import { z } from "zod";

export const SeveritySchema = z.enum(["minor", "severe"]);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Deterministic checks a sub-rule can use instead of an LLM verdict.
 * The LLM only extracts a value from the transcript (`extract` says what);
 * code does the comparison, so amounts, digits and dates are never "judged".
 */
export const CodeCheckSchema = z.discriminatedUnion("check", [
  z.object({
    check: z.literal("customer_field_equals"),
    /** Key in `datos_cliente` to compare against. */
    field: z.string().min(1),
    valueType: z.enum(["text", "number", "date"]),
    extract: z.string().min(1),
  }),
  z.object({
    check: z.literal("date_within_window"),
    /** Window is inclusive and relative to `fecha_llamada`. */
    minDaysAfterCall: z.int(),
    maxDaysAfterCall: z.int(),
    extract: z.string().min(1),
  }),
]);
export type CodeCheck = z.infer<typeof CodeCheckSchema>;

export const EvaluationMethodSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("llm") }),
  z.object({ type: z.literal("code"), check: CodeCheckSchema }),
]);
export type EvaluationMethod = z.infer<typeof EvaluationMethodSchema>;

export const SubRuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  description: z.string().min(1),
  severity: SeveritySchema,
  method: EvaluationMethodSchema,
});
export type SubRule = z.infer<typeof SubRuleSchema>;

export const RuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  text: z.string().min(1),
  subRules: z.array(SubRuleSchema).min(1),
});
export type Rule = z.infer<typeof RuleSchema>;

export const AgentProfileSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  channel: z.string().optional(),
  objective: z.string().optional(),
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export const RubricNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "Use letters, digits, '_' or '-' (max 64)");

export const RubricContentSchema = z
  .object({
    agent: AgentProfileSchema.default({}),
    rules: z.array(RuleSchema).min(1),
  })
  .superRefine((content, ctx) => {
    const seen = new Set<string>();
    for (const rule of content.rules) {
      for (const id of [rule.id, ...rule.subRules.map((s) => s.id)]) {
        if (seen.has(id)) {
          ctx.addIssue({ code: "custom", message: `Duplicate id "${id}"` });
        }
        seen.add(id);
      }
    }
  });
export type RubricContent = z.infer<typeof RubricContentSchema>;

export const RubricSchema = z.object({
  name: RubricNameSchema,
  description: z.string().nullable().default(null),
  isDefault: z.boolean().default(false),
  content: RubricContentSchema,
});
export type Rubric = z.infer<typeof RubricSchema>;
