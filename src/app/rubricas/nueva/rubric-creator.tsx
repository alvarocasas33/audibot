"use client";

import { useState, useTransition } from "react";
import type { Rubric } from "@/lib/schemas/rubric";
import { draftFromFile } from "../actions";
import { RubricEditor } from "../rubric-editor";

interface Props {
  models: { id: string; label: string; isDefault: boolean }[];
}

const EMPTY: Rubric = {
  name: "",
  description: null,
  isDefault: false,
  content: {
    agent: {},
    rules: [{ id: "R1", text: "", subRules: [{ id: "R1.1", description: "", severity: "minor", method: { type: "llm" } }] }],
  },
};

type Draft = { rubric: Rubric; customerFields: string[]; warnings: string[] };

export function RubricCreator({ models }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<"file" | "manual">("file");
  const [model, setModel] = useState(models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? "");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (draft) {
    return (
      <RubricEditor
        initial={draft.rubric}
        originalName={null}
        customerFields={draft.customerFields}
        warnings={draft.warnings}
      />
    );
  }

  async function pickFile(el: HTMLInputElement) {
    const chosen = el.files?.[0];
    setError(null);
    setFile(chosen ? { name: chosen.name, text: await chosen.text() } : null);
  }

  async function useSample() {
    const response = await fetch("/conversaciones_prueba_fde.json");
    setFile({ name: "conversaciones_prueba_fde.json", text: await response.text() });
  }

  function generate() {
    if (!file) return setError("Selecciona un archivo JSON.");
    setError(null);
    startTransition(async () => {
      const result = await draftFromFile({ fileText: file.text, model, language: "es" });
      if (!result.ok) return setError(result.error);
      setDraft({
        rubric: { ...EMPTY, content: result.content },
        customerFields: result.customerFields,
        warnings: result.warnings,
      });
    });
  }

  const tab = (value: "file" | "manual", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={`flex-1 rounded-md px-4 py-2 text-sm ${
        mode === value ? "bg-surface font-medium shadow-sm" : "text-ink-2 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex gap-1 rounded-lg border border-line bg-page p-1">
        {tab("file", "Desde archivo")}
        {tab("manual", "Manual")}
      </div>

      {mode === "file" ? (
        <div className="space-y-5 rounded-lg border border-line bg-surface p-6">
          <p className="text-sm text-ink-2">
            Se leen las reglas <code>R1…Rn</code> de <code>especificacion_agente.reglas</code> y el LLM propone cómo
            dividir cada una en sub-reglas, con severidad y método sugeridos. Después puedes ajustar todo.
          </p>
          <div className="space-y-2">
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => pickFile(e.currentTarget)}
              className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border file:border-line file:bg-page file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
            <div className="flex items-center justify-between text-xs text-ink-2">
              <span>{file ? `Seleccionado: ${file.name}` : "Ningún archivo seleccionado"}</span>
              <button type="button" onClick={useSample} className="text-accent hover:underline">
                Usar archivo de ejemplo
              </button>
            </div>
          </div>
          <label className="block max-w-sm space-y-1 text-sm font-medium">
            Modelo para proponer sub-reglas
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {pending ? "Generando propuesta…" : "Generar propuesta"}
            </button>
            {pending && <span className="text-sm text-ink-2">Suele tardar 10–30 segundos.</span>}
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-line bg-surface p-6">
          <p className="text-sm text-ink-2">Empieza con una regla vacía y agrega las que necesites.</p>
          <button
            type="button"
            onClick={() => setDraft({ rubric: EMPTY, customerFields: [], warnings: [] })}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
          >
            Empezar rúbrica manual
          </button>
        </div>
      )}
    </div>
  );
}
