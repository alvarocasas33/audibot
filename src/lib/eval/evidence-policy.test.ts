import { describe, expect, it } from "vitest";
import type { ConversationReport, SubRuleResult } from "@/lib/schemas/report";
import { applyEvidencePolicy } from "./evaluate";

const sub = (id: string, verdict: SubRuleResult["verdict"]): SubRuleResult => ({
  id,
  description: "",
  method: "llm",
  verdict,
  severity: verdict === "failed" ? "minor" : null,
  evidence: verdict === "not_applicable" ? [] : [{ turn: 1, speaker: "agente", quote: "Hola" }],
  explanation: "why",
});

const report = {
  conversationId: "C1",
  rules: [{ id: "R1", text: "", verdict: "failed", severity: "minor", subRules: [sub("R1.1", "passed"), sub("R1.2", "failed")] }],
} as unknown as ConversationReport;

describe("applyEvidencePolicy", () => {
  it("keeps every quote with 'all'", () => {
    expect(applyEvidencePolicy(report, "all")).toBe(report);
  });

  it("keeps quotes only on failed sub-rules with 'failed', and keeps explanations", () => {
    const [passed, failed] = applyEvidencePolicy(report, "failed").rules[0].subRules;
    expect(passed.evidence).toEqual([]);
    expect(passed.explanation).toBe("why");
    expect(failed.evidence).toHaveLength(1);
  });
});
