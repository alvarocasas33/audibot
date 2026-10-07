import { eq } from "drizzle-orm";
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from "@/lib/schemas/settings";
import { getDb } from "./index";
import { appSettings } from "./schema";

const ROW_ID = "global";

/** Stored values merged over defaults; falls back to defaults if the row is missing or invalid. */
export async function getSettings(): Promise<Settings> {
  const [row] = await getDb().select().from(appSettings).where(eq(appSettings.id, ROW_ID));
  const parsed = SettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = SettingsSchema.parse({ ...(await getSettings()), ...patch });
  await getDb()
    .insert(appSettings)
    .values({ id: ROW_ID, value: settings })
    .onConflictDoUpdate({ target: appSettings.id, set: { value: settings, updatedAt: new Date() } });
  return settings;
}
