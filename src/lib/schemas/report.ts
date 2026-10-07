import { z } from "zod";
import { SeveritySchema } from "./rubric";

export const VerdictSchema = z.enum(["passed", "failed", "not_applicable"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const LanguageSchema = z.enum(["es", "en"]);
export type Language = z.infer<typeof LanguageSchema>;

/** A verbatim transcript turn. Built by code from turn numbers, never written by the LLM. */
export const EvidenceSchema = z.object({
  turn: z.int().positive(),
  speaker: z.string(),
  quote: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const SubRuleResultSchema = z.object({
  id: z.string(),
  description: z.string(),
  method: z.enum(["llm", "code"]),
  verdict: VerdictSchema,
  /** The sub-rule's configured severity when it failed; null otherwise. */
  severity: SeveritySchema.nullable(),
  evidence: z.array(EvidenceSchema),
  explanation: z.string(),
});
export type SubRuleResult = z.infer<typeof SubRuleResultSchema>;

export const RuleResultSchema = z.object({
  id: z.string(),
  text: z.string(),
  verdict: VerdictSchema,
  /** Worst severity among failed sub-rules; null unless failed. */
  severity: SeveritySchema.nullable(),
  subRules: z.array(SubRuleResultSchema),
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const ConversationSeveritySchema = z.enum(["none", "minor", "severe"]);

export const ConversationReportSchema = z.object({
  conversationId: z.string(),
  status: z.enum(["ok", "error"]),
  /** passed / (passed + failed) rules × 100; null when nothing applied or on error. */
  score: z.number().min(0).max(100).nullable(),
  severity: ConversationSeveritySchema.nullable(),
  counts: z.object({
    passed: z.int(),
    failed: z.int(),
    notApplicable: z.int(),
  }),
  rules: z.array(RuleResultSchema),
  warnings: z.array(z.string()),
  error: z.string().nullable(),
  model: z.string(),
  durationMs: z.int(),
  /** True when served from the evaluation cache (same conversation, rubric, model and language). */
  cached: z.boolean(),
});
export type ConversationReport = z.infer<typeof ConversationReportSchema>;

export const RuleComplianceSchema = z.object({
  ruleId: z.string(),
  text: z.string(),
  passed: z.int(),
  failed: z.int(),
  notApplicable: z.int(),
  /** passed / (passed + failed) × 100; null when the rule never applied. */
  complianceRate: z.number().nullable(),
  severeFailures: z.int(),
});

export const TopFailureSchema = z.object({
  ruleId: z.string(),
  subRuleId: z.string(),
  description: z.string(),
  severity: SeveritySchema,
  count: z.int(),
  conversationIds: z.array(z.string()),
});

export const BatchReportSchema = z.object({
  meta: z.object({
    rubric: z.string(),
    model: z.string(),
    language: LanguageSchema,
    generatedAt: z.iso.datetime(),
    durationMs: z.int(),
    conversationCount: z.int(),
    evaluatedCount: z.int(),
    errorCount: z.int(),
    cachedCount: z.int(),
  }),
  summary: z.object({
    /** Mean of conversation scores (conversations with a score only). */
    globalScore: z.number().nullable(),
    severityDistribution: z.object({
      none: z.int(),
      minor: z.int(),
      severe: z.int(),
    }),
    ruleCompliance: z.array(RuleComplianceSchema),
    topFailures: z.array(TopFailureSchema),
  }),
  conversations: z.array(ConversationReportSchema),
});
export type BatchReport = z.infer<typeof BatchReportSchema>;
