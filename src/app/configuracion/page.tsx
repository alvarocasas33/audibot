import { connection } from "next/server";
import { getSettings } from "@/lib/db/settings";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  await connection();
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-ink-2">Ajustes que aplican a todas las evaluaciones.</p>
      </div>
      <SettingsForm initial={settings} />
    </div>
  );
}
