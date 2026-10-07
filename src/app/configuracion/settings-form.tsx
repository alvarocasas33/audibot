"use client";

import { useState, useTransition } from "react";
import type { Settings } from "@/lib/schemas/settings";
import { saveSettings } from "./actions";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [perRequest, setPerRequest] = useState(initial.conversationsPerRequest);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveSettings({ conversationsPerRequest: perRequest });
      setMessage(result.ok ? { ok: true, text: "Guardado." } : { ok: false, text: result.error ?? "Error" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-line bg-surface p-6">
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
          Cuántas conversaciones se evalúan en una sola llamada al modelo. Valores altos usan menos cuota
          (útil en el tier gratuito) pero dan menos atención a cada conversación; 1 es lo más preciso. Si una
          llamada agrupada falla, sus conversaciones se reintentan de a una.
        </p>
      </div>
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
