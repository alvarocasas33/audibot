import { describe, expect, it } from "vitest";
import type { Conversation } from "@/lib/schemas/dataset";
import type { CodeCheck } from "@/lib/schemas/rubric";
import { parseAmount, parseIsoDate, runCodeCheck } from "./code-checks";

const conversation: Conversation = {
  id: "T1",
  fecha_llamada: "2026-09-22",
  datos_cliente: {
    ultimos4_documento: "6259",
    monto_vencido_cop: 2260000,
    fecha_vencimiento: "2026-09-12",
  },
  transcripcion: [{ hablante: "agente", texto: "Hola" }],
};

const digits: CodeCheck = {
  check: "customer_field_equals",
  field: "ultimos4_documento",
  valueType: "text",
  extract: "digits",
};
const amount: CodeCheck = { ...digits, field: "monto_vencido_cop", valueType: "number" };
const dueDate: CodeCheck = { ...digits, field: "fecha_vencimiento", valueType: "date" };
const window: CodeCheck = {
  check: "date_within_window",
  minDaysAfterCall: 0,
  maxDaysAfterCall: 5,
  extract: "date",
};

describe("runCodeCheck", () => {
  it("is not applicable when nothing was extracted", () => {
    expect(runCodeCheck(digits, null, conversation, "es").verdict).toBe("not_applicable");
  });

  it("catches swapped ID digits (C20)", () => {
    expect(runCodeCheck(digits, "6295", conversation, "es").verdict).toBe("failed");
    expect(runCodeCheck(digits, "6259", conversation, "es").verdict).toBe("passed");
  });

  it("catches a wrong amount regardless of formatting (C11)", () => {
    expect(runCodeCheck(amount, "2620000", conversation, "es").verdict).toBe("failed");
    expect(runCodeCheck(amount, "2.260.000", conversation, "es").verdict).toBe("passed");
  });

  it("catches a wrong due date (C19)", () => {
    expect(runCodeCheck(dueDate, "2026-09-21", conversation, "es").verdict).toBe("failed");
  });

  it("enforces the payment window inclusively", () => {
    expect(runCodeCheck(window, "2026-09-22", conversation, "es").verdict).toBe("passed");
    expect(runCodeCheck(window, "2026-09-27", conversation, "es").verdict).toBe("passed");
    expect(runCodeCheck(window, "2026-09-21", conversation, "es").verdict).toBe("failed"); // C17
    expect(runCodeCheck(window, "2026-10-04", conversation, "es").verdict).toBe("failed"); // C10
  });

  it("does not guess on unparseable values", () => {
    const outcome = runCodeCheck(window, "el sábado", conversation, "en");
    expect(outcome.verdict).toBe("not_applicable");
    expect(outcome.warning).toBeDefined();
  });
});

describe("parsers", () => {
  it("parses amounts and rejects impossible dates", () => {
    expect(parseAmount("$1.250.000")).toBe(1250000);
    expect(parseAmount("mil")).toBeNull();
    expect(parseIsoDate("2026-02-31")).toBeNull();
  });
});
