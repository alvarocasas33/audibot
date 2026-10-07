import type { Verdict } from "@/lib/schemas/report";
import type { Severity } from "@/lib/schemas/rubric";

// Status colors never carry meaning alone: every badge pairs an icon with a label.

const VERDICT = {
  passed: { label: "Cumple", icon: "✓", className: "text-good-ink", dot: "bg-good" },
  failed: { label: "No cumple", icon: "✕", className: "text-critical", dot: "bg-critical" },
  not_applicable: { label: "No aplica", icon: "–", className: "text-muted", dot: "bg-baseline" },
} as const;

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${v.className}`}>
      <span aria-hidden className="font-bold">
        {v.icon}
      </span>
      {v.label}
    </span>
  );
}

const SEVERITY = {
  minor: { label: "Leve", icon: "!", className: "border-warning/60 bg-warning/15" },
  severe: { label: "Grave", icon: "‼", className: "border-critical/60 bg-critical/15" },
} as const;

export function SeverityBadge({ severity }: { severity: Severity | "none" | null }) {
  if (!severity || severity === "none") {
    return <span className="text-xs text-muted">Sin fallas</span>;
  }
  const s = SEVERITY[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium text-ink ${s.className}`}
    >
      <span aria-hidden className="font-bold">
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}

export function MethodBadge({ method }: { method: "llm" | "code" }) {
  return (
    <span
      title={method === "code" ? "Verificado por código contra los datos del cliente" : "Evaluado por el LLM"}
      className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-2"
    >
      {method === "code" ? "Código" : "LLM"}
    </span>
  );
}

export function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 10) / 10}`;
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(date));
}
