import { z } from "zod";

export const EvidencePolicySchema = z.enum(["all", "failed"]);
export type EvidencePolicy = z.infer<typeof EvidencePolicySchema>;

const penalty = z.int().min(0).max(100);

const fields = {
  /** Conversations sent to the model in a single request (1 = one request per conversation). */
  conversationsPerRequest: z.int().min(1).max(10),
  /** Which criteria carry transcript quotes: every evaluated one, or only failures. */
  evidence: EvidencePolicySchema,
  /** Points subtracted from 100 in the weighted score for each failed rule, by severity. */
  minorPenalty: penalty,
  severePenalty: penalty,
};

export const DEFAULT_SETTINGS = {
  conversationsPerRequest: 5,
  evidence: "failed" as EvidencePolicy,
  minorPenalty: 5,
  severePenalty: 25,
};

/** Full settings: missing fields fall back to defaults. */
export const SettingsSchema = z.object({
  conversationsPerRequest: fields.conversationsPerRequest.default(DEFAULT_SETTINGS.conversationsPerRequest),
  evidence: fields.evidence.default(DEFAULT_SETTINGS.evidence),
  minorPenalty: fields.minorPenalty.default(DEFAULT_SETTINGS.minorPenalty),
  severePenalty: fields.severePenalty.default(DEFAULT_SETTINGS.severePenalty),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type Penalties = Pick<Settings, "minorPenalty" | "severePenalty">;

/** PATCH body: no defaults, so omitted fields are left untouched. */
export const SettingsPatchSchema = z.object(fields).partial().strict();
