"use server";

import { revalidatePath } from "next/cache";
import { updateSettings } from "@/lib/db/settings";
import { SettingsPatchSchema } from "@/lib/schemas/settings";

export async function saveSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = SettingsPatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Valores inválidos: conversaciones por solicitud entre 1 y 10; citas «all» o «failed»." };
  }
  await updateSettings(parsed.data);
  revalidatePath("/configuracion");
  return { ok: true };
}
