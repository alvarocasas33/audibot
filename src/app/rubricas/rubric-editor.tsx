"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EvaluationMethod, Rubric, Rule, Severity, SubRule } from "@/lib/schemas/rubric";
import { removeRubric, saveRubric } from "./actions";

const input = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm";
const small = "rounded-md border border-line bg-surface px-2 py-1.5 text-sm";

/** IDs follow position (R1, R1.1…), so adding/removing never leaves gaps or duplicates. */
function renumber(rules: Rule[]): Rule[] {
  return rules.map((rule, i) => ({
    ...rule,
    id: `R${i + 1}`,
    subRules: rule.subRules.map((sub, j) => ({ ...sub, id: `R${i + 1}.${j + 1}` })),
  }));
}

const newSubRule = (): SubRule => ({ id: "", description: "", severity: "minor", method: { type: "llm" } });
const newRule = (): Rule => ({ id: "", text: "", subRules: [newSubRule()] });

type MethodKind = "llm" | "customer_field_equals" | "date_within_window";

function methodKind(method: EvaluationMethod): MethodKind {
  return method.type === "llm" ? "llm" : method.check.check;
}

function defaultMethod(kind: MethodKind, fields: string[]): EvaluationMethod {
  if (kind === "llm") return { type: "llm" };
  if (kind === "customer_field_equals") {
    return {
      type: "code",
      check: { check: "customer_field_equals", field: fields[0] ?? "", valueType: "text", extract: "" },
    };
  }
  return {
    type: "code",
    check: { check: "date_within_window", minDaysAfterCall: 0, maxDaysAfterCall: 5, extract: "" },
  };
}

function MethodFields({
  method,
  fields,
  onChange,
}: {
  method: EvaluationMethod;
  fields: string[];
  onChange: (method: EvaluationMethod) => void;
}) {
  if (method.type === "llm") return null;
  const check = method.check;
  const set = (patch: Partial<typeof check>) =>
    onChange({ type: "code", check: { ...check, ...patch } as typeof check });

  return (
    <div className="space-y-2 rounded-md bg-page p-3">
      {check.check === "customer_field_equals" ? (
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-2">
            Campo del cliente
            <input
              list="customer-fields"
              value={check.field}
              onChange={(e) => set({ field: e.target.value })}
              className={small}
              placeholder="monto_vencido_cop"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            Tipo
            <select
              value={check.valueType}
              onChange={(e) => set({ valueType: e.target.value as "text" | "number" | "date" })}
              className={small}
            >
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="date">Fecha</option>
            </select>
          </label>
          <datalist id="customer-fields">
            {fields.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-xs text-ink-2">
          <label className="flex items-center gap-2">
            Desde (días tras la llamada)
            <input
              type="number"
              value={check.minDaysAfterCall}
              onChange={(e) => set({ minDaysAfterCall: Number(e.target.value) })}
              className={`${small} w-20`}
            />
          </label>
          <label className="flex items-center gap-2">
            Hasta
            <input
              type="number"
              value={check.maxDaysAfterCall}
              onChange={(e) => set({ maxDaysAfterCall: Number(e.target.value) })}
              className={`${small} w-20`}
            />
          </label>
        </div>
      )}
      <label className="block space-y-1 text-xs text-ink-2">
        Qué debe extraer el LLM de la conversación (formato y cuándo devolver null)
        <textarea
          rows={2}
          value={check.extract}
          onChange={(e) => set({ extract: e.target.value })}
          className={input}
          placeholder="El monto que el agente informó al titular, como número entero. null si no lo informó."
        />
      </label>
    </div>
  );
}

function SubRuleEditor({
  sub,
  fields,
  canRemove,
  onChange,
  onRemove,
}: {
  sub: SubRule;
  fields: string[];
  canRemove: boolean;
  onChange: (sub: SubRule) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-2 border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 font-mono text-xs text-ink-2">{sub.id}</span>
        <select
          aria-label="Severidad"
          value={sub.severity}
          onChange={(e) => onChange({ ...sub, severity: e.target.value as Severity })}
          className={small}
        >
          <option value="minor">Leve</option>
          <option value="severe">Grave</option>
        </select>
        <select
          aria-label="Método de evaluación"
          value={methodKind(sub.method)}
          onChange={(e) => onChange({ ...sub, method: defaultMethod(e.target.value as MethodKind, fields) })}
          className={small}
        >
          <option value="llm">LLM (interpretación)</option>
          <option value="customer_field_equals">Código: comparar con dato del cliente</option>
          <option value="date_within_window">Código: fecha dentro de un rango</option>
        </select>
        {canRemove && (
          <button type="button" onClick={onRemove} className="ml-auto text-xs text-critical hover:underline">
            Quitar sub-regla
          </button>
        )}
      </div>
      <textarea
        aria-label="Descripción de la sub-regla"
        rows={2}
        value={sub.description}
        onChange={(e) => onChange({ ...sub, description: e.target.value })}
        className={input}
        placeholder="Si el cliente pide un descuento, el agente registra la solicitud…"
      />
      <MethodFields method={sub.method} fields={fields} onChange={(method) => onChange({ ...sub, method })} />
    </li>
  );
}

export function RubricEditor({
  initial,
  originalName,
  customerFields = [],
  warnings = [],
}: {
  initial: Rubric;
  originalName: string | null;
  customerFields?: string[];
  warnings?: string[];
}) {
  const router = useRouter();
  const [rubric, setRubric] = useState<Rubric>({ ...initial, content: { ...initial.content, rules: renumber(initial.content.rules) } });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  // Fields offered for code checks: from the uploaded file plus any already used by the rubric.
  const fields = [
    ...new Set([
      ...customerFields,
      ...rubric.content.rules.flatMap((r) =>
        r.subRules.flatMap((s) =>
          s.method.type === "code" && s.method.check.check === "customer_field_equals" ? [s.method.check.field] : [],
        ),
      ),
    ]),
  ].filter(Boolean);

  const setRules = (rules: Rule[]) =>
    setRubric((r) => ({ ...r, content: { ...r.content, rules: renumber(rules) } }));
  const rules = rubric.content.rules;
  const updateRule = (i: number, rule: Rule) => setRules(rules.map((r, k) => (k === i ? rule : r)));
  const agent = rubric.content.agent ?? {};
  const setAgent = (patch: Partial<typeof agent>) =>
    setRubric((r) => ({ ...r, content: { ...r.content, agent: { ...agent, ...patch } } }));

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveRubric({ originalName, rubric });
      if (result.ok) router.push("/rubricas");
      else setError(result.error);
    });
  }

  function remove() {
    if (!originalName) return;
    startTransition(async () => {
      const result = await removeRubric(originalName);
      if (result.ok) router.push("/rubricas");
      else setError(result.error ?? "Error");
    });
  }

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <section className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Nombre
          <input
            value={rubric.name}
            onChange={(e) => setRubric({ ...rubric, name: e.target.value })}
            className={`${input} font-normal`}
            placeholder="Banco_Andino_02"
          />
          <span className="block text-xs font-normal text-muted">Letras, números, _ o -. Ej.: Cliente_Bot_01</span>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Descripción
          <input
            value={rubric.description ?? ""}
            onChange={(e) => setRubric({ ...rubric, description: e.target.value || null })}
            className={`${input} font-normal`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={rubric.isDefault}
            onChange={(e) => setRubric({ ...rubric, isDefault: e.target.checked })}
          />
          Rúbrica predeterminada (se usa cuando una evaluación no indica rúbrica)
        </label>
        <details className="sm:col-span-2">
          <summary className="cursor-pointer text-sm text-ink-2">Perfil del agente (contexto para el LLM)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["name", "Nombre del agente"],
                ["company", "Empresa"],
                ["channel", "Canal"],
                ["objective", "Objetivo"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-ink-2">
                {label}
                <input
                  value={agent[key] ?? ""}
                  onChange={(e) => setAgent({ [key]: e.target.value || undefined })}
                  className={input}
                />
              </label>
            ))}
          </div>
        </details>
      </section>

      <ol className="space-y-4">
        {rules.map((rule, i) => (
          <li key={i} className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-3 flex items-start gap-3">
              <span className="mt-2 w-10 font-mono text-sm font-semibold">{rule.id}</span>
              <textarea
                aria-label={`Texto de la regla ${rule.id}`}
                rows={2}
                value={rule.text}
                onChange={(e) => updateRule(i, { ...rule, text: e.target.value })}
                className={input}
                placeholder="Texto de la regla de negocio"
              />
              {rules.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRules(rules.filter((_, k) => k !== i))}
                  className="mt-2 whitespace-nowrap text-xs text-critical hover:underline"
                >
                  Quitar regla
                </button>
              )}
            </div>
            <ul className="pl-13">
              {rule.subRules.map((sub, j) => (
                <SubRuleEditor
                  key={j}
                  sub={sub}
                  fields={fields}
                  canRemove={rule.subRules.length > 1}
                  onChange={(next) =>
                    updateRule(i, { ...rule, subRules: rule.subRules.map((s, k) => (k === j ? next : s)) })
                  }
                  onRemove={() => updateRule(i, { ...rule, subRules: rule.subRules.filter((_, k) => k !== j) })}
                />
              ))}
            </ul>
            <button
              type="button"
              onClick={() => updateRule(i, { ...rule, subRules: [...rule.subRules, newSubRule()] })}
              className="mt-2 text-sm text-accent hover:underline"
            >
              + Agregar sub-regla
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setRules([...rules, newRule()])}
        className="w-full rounded-lg border border-dashed border-line py-3 text-sm text-accent hover:bg-surface"
      >
        + Agregar regla
      </button>

      {error && (
        <p role="alert" className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-page py-4">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar rúbrica"}
        </button>
        <span className="text-xs text-ink-2">
          {rules.length} reglas · {rules.reduce((n, r) => n + r.subRules.length, 0)} sub-reglas
        </span>
        {originalName && !initial.isDefault && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            {confirmDelete ? (
              <>
                <span className="text-ink-2">¿Eliminar {originalName}?</span>
                <button type="button" onClick={remove} className="font-medium text-critical hover:underline">
                  Sí, eliminar
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-ink-2 hover:underline">
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-critical hover:underline">
                Eliminar rúbrica
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
