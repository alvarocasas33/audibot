"use client";

import { useState } from "react";
import { MethodBadge, SeverityBadge, VerdictBadge, formatScore } from "@/components/badges";
import type { BatchReport, ConversationReport, RuleResult } from "@/lib/schemas/report";

const ALL = "__all__";

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-5 ${className}`}>
      {title && <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-2">{title}</h2>}
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
  valueClassName = "",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${valueClassName}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-2">{hint}</div>}
    </div>
  );
}

/** One horizontal bar per rule: compliance % over applicable conversations. */
function ComplianceBars({ rows }: { rows: BatchReport["summary"]["ruleCompliance"] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const applicable = r.passed + r.failed;
        const tip = `${r.ruleId}: ${r.passed} cumple · ${r.failed} no cumple · ${r.notApplicable} no aplica`;
        return (
          <li key={r.ruleId} title={tip} className="group grid grid-cols-[3rem_1fr_7.5rem] items-center gap-3">
            <span className="font-mono text-sm font-medium">{r.ruleId}</span>
            <div className="min-w-0">
              <div className="mb-1 truncate text-xs text-ink-2">{r.text}</div>
              <div className="h-2 rounded-full bg-bar-track">
                {r.complianceRate !== null && (
                  <div
                    className="h-2 rounded-full bg-bar transition-opacity group-hover:opacity-80"
                    style={{ width: `${Math.max(r.complianceRate, 1)}%` }}
                  />
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold tabular-nums">
                {r.complianceRate === null ? "—" : `${formatScore(r.complianceRate)}%`}
              </div>
              <div className="text-[11px] text-muted">
                {applicable ? `${r.passed}/${applicable}` : "sin casos"}
                {r.notApplicable ? ` · ${r.notApplicable} N/A` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RuleDetail({ rule }: { rule: RuleResult }) {
  const [open, setOpen] = useState(rule.verdict === "failed");
  return (
    <li className="rounded-md border border-line">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-page"
      >
        <span className="w-10 font-mono text-sm font-medium">{rule.id}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{rule.text}</span>
        {rule.verdict === "failed" && <SeverityBadge severity={rule.severity} />}
        <span className="w-24 text-right">
          <VerdictBadge verdict={rule.verdict} />
        </span>
        <span aria-hidden className="text-muted">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line">
          {rule.subRules.map((s) => (
            <li key={s.id} className="space-y-2 px-4 py-3 pl-14">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-2">{s.id}</span>
                <MethodBadge method={s.method} />
                <VerdictBadge verdict={s.verdict} />
                {s.severity && <SeverityBadge severity={s.severity} />}
              </div>
              <p className="text-sm">{s.description}</p>
              <p className="text-sm text-ink-2">{s.explanation}</p>
              {s.evidence.length > 0 && (
                <div className="space-y-1">
                  {s.evidence.map((e) => (
                    <blockquote
                      key={e.turn}
                      className={`rounded border-l-2 bg-page px-3 py-2 text-sm ${
                        s.verdict === "failed" ? "border-critical" : "border-baseline"
                      }`}
                    >
                      <span className="mr-2 font-mono text-xs text-muted">
                        #{e.turn} {e.speaker}
                      </span>
                      “{e.quote}”
                    </blockquote>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ConversationDetail({ conversation }: { conversation: ConversationReport }) {
  if (conversation.status === "error") {
    return (
      <p className="rounded-md border border-critical/40 bg-critical/10 p-4 text-sm">
        No se pudo evaluar esta conversación: {conversation.error}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <span>
          Nota ponderada{" "}
          <strong className="font-mono text-lg tabular-nums">{formatScore(conversation.weightedScore ?? null)}</strong>
        </span>
        <span>
          Cumplimiento <strong className="font-mono tabular-nums">{formatScore(conversation.score)}</strong>
        </span>
        <span className="text-ink-2">
          {conversation.counts.passed} cumple · {conversation.counts.failed} no cumple ·{" "}
          {conversation.counts.notApplicable} no aplica
        </span>
        <SeverityBadge severity={conversation.severity} />
      </div>
      {conversation.warnings.length > 0 && (
        <ul className="rounded-md border border-warning/50 bg-warning/10 p-3 text-xs">
          {conversation.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
      <ul className="space-y-2">
        {conversation.rules.map((rule) => (
          <RuleDetail key={rule.id} rule={rule} />
        ))}
      </ul>
    </div>
  );
}

function ConversationTable({
  conversations,
  onSelect,
}: {
  conversations: ConversationReport[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 pr-4 font-medium">Conversación</th>
            <th className="py-2 pr-4 text-right font-medium">Ponderada</th>
            <th className="py-2 pr-4 text-right font-medium">Cumplimiento</th>
            <th className="py-2 pr-4 font-medium">Severidad</th>
            <th className="py-2 font-medium">Reglas incumplidas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {conversations.map((c) => (
            <tr key={c.conversationId} onClick={() => onSelect(c.conversationId)} className="cursor-pointer hover:bg-page">
              <td className="py-2 pr-4 font-mono font-medium text-accent">{c.conversationId}</td>
              <td className="py-2 pr-4 text-right font-mono font-semibold tabular-nums">
                {c.status === "error" ? "error" : formatScore(c.weightedScore ?? null)}
              </td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums text-ink-2">
                {c.status === "error" ? "—" : formatScore(c.score)}
              </td>
              <td className="py-2 pr-4">
                <SeverityBadge severity={c.severity} />
              </td>
              <td className="py-2 text-xs text-ink-2">
                {c.rules
                  .filter((r) => r.verdict === "failed")
                  .map((r) => r.id)
                  .join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportView({ report }: { report: BatchReport }) {
  const [selected, setSelected] = useState(ALL);
  const { summary, meta, conversations } = report;
  const current = conversations.find((c) => c.conversationId === selected);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Nota ponderada"
          value={formatScore(summary.globalWeightedScore ?? null)}
          hint={
            meta.scoring
              ? `100 − ${meta.scoring.minorPenalty} por falla leve − ${meta.scoring.severePenalty} por grave`
              : "No disponible en este reporte"
          }
        />
        <StatTile label="Cumplimiento" value={formatScore(summary.globalScore)} hint="% de reglas aplicables que cumplen" />
        <StatTile
          label="Con fallas graves"
          valueClassName={summary.severityDistribution.severe ? "text-critical" : ""}
          value={summary.severeFailureRate == null ? "—" : `${formatScore(summary.severeFailureRate)}% (${summary.severityDistribution.severe})`}
          hint={`De ${meta.evaluatedCount} conversaciones`}
        />
        <StatTile
          label="Con fallas leves"
          value={summary.minorFailureRate == null ? "—" : `${formatScore(summary.minorFailureRate)}% (${summary.severityDistribution.minor})`}
          hint={`De ${meta.evaluatedCount} · solo leves, sin graves`}
        />
        <StatTile
          label="Conversaciones"
          value={meta.evaluatedCount}
          hint={`${meta.conversationCount} en el archivo${meta.errorCount ? ` · ${meta.errorCount} con error` : ""}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title="Cumplimiento por regla">
          <ComplianceBars rows={summary.ruleCompliance} />
        </Card>
        <Card title="Fallas más repetidas">
          <ol className="space-y-4">
            {summary.topFailures.map((f, i) => (
              <li key={f.subRuleId} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{i + 1}.</span>
                  <span className="font-mono text-sm font-medium">{f.subRuleId}</span>
                  <SeverityBadge severity={f.severity} />
                  <span className="ml-auto font-mono text-sm tabular-nums">×{f.count}</span>
                </div>
                <p className="text-sm text-ink-2">{f.description}</p>
                <div className="flex flex-wrap gap-1">
                  {f.conversationIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelected(id)}
                      className="rounded border border-line px-1.5 py-0.5 font-mono text-xs hover:border-accent hover:text-accent"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {summary.topFailures.length === 0 && <p className="text-sm text-ink-2">Sin fallas. 🎉</p>}
          </ol>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">Conversaciones</h2>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-2">Filtrar</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm"
            >
              <option value={ALL}>Todas</option>
              {conversations.map((c) => (
                <option key={c.conversationId} value={c.conversationId}>
                  {c.conversationId} — nota {c.status === "error" ? "error" : formatScore(c.weightedScore ?? c.score)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {current ? (
          <ConversationDetail key={current.conversationId} conversation={current} />
        ) : (
          <ConversationTable conversations={conversations} onSelect={setSelected} />
        )}
      </Card>
    </div>
  );
}
