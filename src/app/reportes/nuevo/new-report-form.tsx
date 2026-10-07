"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createReport } from "../actions";

interface Props {
  rubrics: { name: string; isDefault: boolean; subRuleCount: number }[];
  models: { id: string; label: string; isDefault: boolean }[];
}

const SAMPLE_URL = "/conversaciones_prueba_fde.json";

const field = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm";

export function NewReportForm({ rubrics, models }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [rubric, setRubric] = useState(rubrics.find((r) => r.isDefault)?.name ?? rubrics[0]?.name ?? "");
  const [model, setModel] = useState(models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? "");
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function pickFile(input: HTMLInputElement) {
    const chosen = input.files?.[0];
    setError(null);
    setFile(chosen ? { name: chosen.name, text: await chosen.text() } : null);
  }

  async function useSample() {
    setError(null);
    const response = await fetch(SAMPLE_URL);
    setFile({ name: "conversaciones_prueba_fde.json", text: await response.text() });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError("Selecciona un archivo JSON.");
    setError(null);
    startTransition(async () => {
      const result = await createReport({
        fileText: file.text,
        fileName: file.name,
        rubric: rubric || null,
        model: model || null,
        language,
      });
      if (result.ok) router.push(`/reportes/${result.id}`);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-line bg-surface p-6">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="file">
          Archivo de conversaciones
        </label>
        <input
          id="file"
          type="file"
          accept="application/json,.json"
          onChange={(e) => pickFile(e.currentTarget)}
          className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border file:border-line file:bg-page file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
        <div className="flex items-center justify-between text-xs text-ink-2">
          <span>{file ? `Seleccionado: ${file.name}` : "Ningún archivo seleccionado"}</span>
          <button type="button" onClick={useSample} className="text-accent hover:underline">
            Usar archivo de ejemplo (20 conversaciones)
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="rubric">
            Rúbrica
          </label>
          <select id="rubric" value={rubric} onChange={(e) => setRubric(e.target.value)} className={field}>
            {rubrics.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
                {r.isDefault ? " (predeterminada)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="model">
            Modelo
          </label>
          <select id="model" value={model} onChange={(e) => setModel(e.target.value)} className={field}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="language">
            Idioma del reporte
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "es" | "en")}
            className={field}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Evaluando…" : "Evaluar"}
        </button>
        {pending && (
          <span className="text-sm text-ink-2">
            Puede tardar hasta 2 minutos. Las conversaciones ya evaluadas se reutilizan al instante.
          </span>
        )}
      </div>
    </form>
  );
}
