import type { Conversation } from "@/lib/schemas/dataset";
import type { Language, Verdict } from "@/lib/schemas/report";
import type { CodeCheck } from "@/lib/schemas/rubric";

export interface CodeCheckOutcome {
  verdict: Verdict;
  explanation: string;
  warning?: string;
}

const DAY_MS = 86_400_000;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Accepts "1250000", "1.250.000", "1,250,000", "$1 250 000". */
export function parseAmount(value: string): number | null {
  const digits = value.replace(/[^\d-]/g, "");
  if (!/^-?\d+$/.test(digits)) return null;
  return Number(digits);
}

export function parseIsoDate(value: string): number | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const time = Date.UTC(+match[1], +match[2] - 1, +match[3]);
  const date = new Date(time);
  // Reject rollovers such as 2026-02-31.
  return date.getUTCDate() === +match[3] ? time : null;
}

function formatValue(value: unknown, valueType: string, language: Language): string {
  if (valueType === "number" && typeof value === "number") {
    return value.toLocaleString(language === "es" ? "es-CO" : "en-US");
  }
  return String(value);
}

const MESSAGES = {
  es: {
    notProvided: "El valor no aparece en la conversación, así que la verificación no aplica.",
    missingField: (field: string) => `Los datos del cliente no incluyen el campo "${field}".`,
    unparseable: (raw: string) => `No se pudo interpretar el valor extraído "${raw}".`,
    match: (got: string) => `El valor de la conversación (${got}) coincide con los datos del cliente.`,
    mismatch: (got: string, expected: string) =>
      `El valor de la conversación (${got}) no coincide con los datos del cliente (${expected}).`,
    inWindow: (date: string, days: number) =>
      `La fecha ${date} está ${days} día(s) después de la llamada, dentro del rango permitido.`,
    beforeWindow: (date: string, days: number) =>
      days < 0
        ? `La fecha ${date} es anterior a la fecha de la llamada (${-days} día(s) antes).`
        : `La fecha ${date} está solo ${days} día(s) después de la llamada, antes del mínimo permitido.`,
    afterWindow: (date: string, days: number, max: number) =>
      `La fecha ${date} está ${days} día(s) después de la llamada; el máximo permitido es ${max}.`,
  },
  en: {
    notProvided: "The value does not appear in the conversation, so this check does not apply.",
    missingField: (field: string) => `Customer data has no "${field}" field.`,
    unparseable: (raw: string) => `Could not interpret the extracted value "${raw}".`,
    match: (got: string) => `The value in the conversation (${got}) matches the customer data.`,
    mismatch: (got: string, expected: string) =>
      `The value in the conversation (${got}) does not match the customer data (${expected}).`,
    inWindow: (date: string, days: number) =>
      `${date} is ${days} day(s) after the call, within the allowed window.`,
    beforeWindow: (date: string, days: number) =>
      days < 0
        ? `${date} is before the call date (${-days} day(s) earlier).`
        : `${date} is only ${days} day(s) after the call, before the allowed minimum.`,
    afterWindow: (date: string, days: number, max: number) =>
      `${date} is ${days} day(s) after the call; the maximum allowed is ${max}.`,
  },
} as const;

export function runCodeCheck(
  check: CodeCheck,
  extracted: string | null,
  conversation: Conversation,
  language: Language,
): CodeCheckOutcome {
  const t = MESSAGES[language];
  if (extracted === null || extracted.trim() === "") {
    return { verdict: "not_applicable", explanation: t.notProvided };
  }

  if (check.check === "customer_field_equals") {
    const expected = conversation.datos_cliente[check.field];
    if (expected === undefined || expected === null) {
      const warning = t.missingField(check.field);
      return { verdict: "not_applicable", explanation: warning, warning };
    }

    let equal: boolean;
    if (check.valueType === "number") {
      const got = parseAmount(extracted);
      const want = typeof expected === "number" ? expected : parseAmount(String(expected));
      if (got === null || want === null) {
        const warning = t.unparseable(extracted);
        return { verdict: "not_applicable", explanation: warning, warning };
      }
      equal = got === want;
      const shown = formatValue(got, "number", language);
      const expectedShown = formatValue(want, "number", language);
      return equal
        ? { verdict: "passed", explanation: t.match(shown) }
        : { verdict: "failed", explanation: t.mismatch(shown, expectedShown) };
    }

    if (check.valueType === "date") {
      const got = parseIsoDate(extracted);
      const want = parseIsoDate(String(expected));
      if (got === null || want === null) {
        const warning = t.unparseable(extracted);
        return { verdict: "not_applicable", explanation: warning, warning };
      }
      equal = got === want;
    } else {
      equal = normalizeText(extracted) === normalizeText(String(expected));
    }
    return equal
      ? { verdict: "passed", explanation: t.match(extracted) }
      : { verdict: "failed", explanation: t.mismatch(extracted, String(expected)) };
  }

  // date_within_window
  const date = parseIsoDate(extracted);
  const callDate = parseIsoDate(conversation.fecha_llamada);
  if (date === null || callDate === null) {
    const warning = t.unparseable(extracted);
    return { verdict: "not_applicable", explanation: warning, warning };
  }
  const days = Math.round((date - callDate) / DAY_MS);
  if (days < check.minDaysAfterCall) {
    return { verdict: "failed", explanation: t.beforeWindow(extracted, days) };
  }
  if (days > check.maxDaysAfterCall) {
    return {
      verdict: "failed",
      explanation: t.afterWindow(extracted, days, check.maxDaysAfterCall),
    };
  }
  return { verdict: "passed", explanation: t.inWindow(extracted, days) };
}
