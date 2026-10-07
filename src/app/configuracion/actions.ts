"use server";

import { revalidatePath } from "next/cache";
import { updateSettings } from "@/lib/db/settings";
import { SettingsPatchSchema } from "@/lib/schemas/settings";

export async function saveSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = SettingsPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Valor inválido (debe ser un entero entre 1 y 10)." };
  await updateSettings(parsed.data);
  revalidatePath("/configuracion");
  return { ok: true };
}
