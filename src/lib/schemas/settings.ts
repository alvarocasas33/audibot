import { z } from "zod";

const fields = {
  /** Conversations sent to the model in a single request (1 = one request per conversation). */
  conversationsPerRequest: z.int().min(1).max(10),
};

export const DEFAULT_SETTINGS = { conversationsPerRequest: 5 };

/** Full settings: missing fields fall back to defaults. */
export const SettingsSchema = z.object({
  conversationsPerRequest: fields.conversationsPerRequest.default(DEFAULT_SETTINGS.conversationsPerRequest),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** PATCH body: no defaults, so omitted fields are left untouched. */
export const SettingsPatchSchema = z.object(fields).partial().strict();
