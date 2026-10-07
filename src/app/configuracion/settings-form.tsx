"use client";

import { useState, useTransition } from "react";
import type { EvidencePolicy, Settings } from "@/lib/schemas/settings";
import { saveSettings } from "./actions";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [perRequest, setPerRequest] = useState(initial.conversationsPerRequest);
  const [evidence, setEvidence] = useState<EvidencePolicy>(initial.evidence);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveSettings({ conversationsPerRequest: perRequest, evidence });
      setMessage(result.ok ? { ok: true, text: "Guardado." } : { ok: false, text: result.error ?? "Error" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-lg border border-line bg-surface p-6">
      <div className="space-y-2">
        <label htmlFor="perRequest" className="text-sm font-medium">
          Conversaciones por solicitud al LLM
        </label>
        <input
          id="perRequest"
          type="number"
          min={1}
          max={10}
          value={perRequest}
          onChange={(e) => setPerRequest(Number(e.target.value))}
          className="w-28 rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        <p className="text-xs text-ink-2">
          Cuántas conversaciones se evalúan en una sola llamada al modelo. Valores altos usan menos solicitudes
          (útil en el tier gratuito) pero dan menos atención a cada conversación; 1 es lo más preciso. Si una
          llamada agrupada falla, sus conversaciones se reintentan de a una.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Citas de la transcripción en el reporte</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="evidence"
            checked={evidence === "all"}
            onChange={() => setEvidence("all")}
            className="mt-1"
          />
          <span>
            Todos los criterios evaluados
            <span className="block text-xs text-ink-2">Cada criterio que cumple o no cumple trae la cita que lo justifica.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="evidence"
            checked={evidence === "failed"}
            onChange={() => setEvidence("failed")}
            className="mt-1"
          />
          <span>
            Solo los que no cumplen
            <span className="block text-xs text-ink-2">Reporte más liviano; los criterios que cumplen conservan su explicación.</span>
          </span>
        </label>
        <p className="text-xs text-ink-2">
          Se aplica al generar el reporte, sin volver a evaluar: las conversaciones ya evaluadas se reutilizan.
        </p>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {message && (
          <span role="status" className={`text-sm ${message.ok ? "text-good-ink" : "text-critical"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
