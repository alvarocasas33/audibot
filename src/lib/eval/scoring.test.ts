import { describe, expect, it } from "vitest";
import type { RuleResult, SubRuleResult, Verdict } from "@/lib/schemas/report";
import type { Rule, Severity } from "@/lib/schemas/rubric";
import { buildRuleResult, combineVerdicts, scoreConversation } from "./scoring";

const rule: Rule = {
  id: "R1",
  text: "Rule",
  subRules: [{ id: "R1.1", description: "", severity: "minor", method: { type: "llm" } }],
};

function sub(verdict: Verdict, severity: Severity | null = null): SubRuleResult {
  return { id: "x", description: "", method: "llm", verdict, severity, evidence: [], explanation: "" };
}

describe("combineVerdicts", () => {
  it("fails if any sub-rule fails", () => {
    expect(combineVerdicts(["passed", "failed", "not_applicable"])).toBe("failed");
  });
  it("passes with at least one pass and the rest not applicable", () => {
    expect(combineVerdicts(["passed", "not_applicable"])).toBe("passed");
  });
  it("is not applicable when nothing applied", () => {
    expect(combineVerdicts(["not_applicable", "not_applicable"])).toBe("not_applicable");
  });
});

describe("buildRuleResult", () => {
  it("takes the worst severity among failed sub-rules", () => {
    const result = buildRuleResult(rule, [sub("failed", "minor"), sub("failed", "severe"), sub("passed")]);
    expect(result).toMatchObject({ verdict: "failed", severity: "severe" });
  });
  it("has no severity unless failed", () => {
    expect(buildRuleResult(rule, [sub("passed")]).severity).toBeNull();
  });
});

describe("scoreConversation", () => {
  const r = (verdict: Verdict, severity: Severity | null = null) =>
    ({ id: "R", text: "", verdict, severity, subRules: [] }) as RuleResult;

  it("scores passed over applicable rules", () => {
    const result = scoreConversation([r("passed"), r("passed"), r("failed", "minor"), r("not_applicable")]);
    expect(result.score).toBeCloseTo(66.7);
    expect(result.severity).toBe("minor");
    expect(result.counts).toEqual({ passed: 2, failed: 1, notApplicable: 1 });
  });
  it("returns a null score when nothing applied", () => {
    expect(scoreConversation([r("not_applicable")]).score).toBeNull();
  });
});
