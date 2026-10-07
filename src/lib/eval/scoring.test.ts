import { describe, expect, it } from "vitest";
import type { RuleResult, SubRuleResult, Verdict } from "@/lib/schemas/report";
import type { Rule, Severity } from "@/lib/schemas/rubric";
import { aggregate, buildRuleResult, combineVerdicts, scoreConversation, weightedScore } from "./scoring";

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

describe("weightedScore", () => {
  const r = (verdict: Verdict, severity: Severity | null = null) =>
    ({ id: "R", text: "", verdict, severity, subRules: [] }) as RuleResult;
  const penalties = { minorPenalty: 5, severePenalty: 25 };

  it("subtracts the penalty of each failed rule by severity", () => {
    expect(weightedScore([r("passed"), r("failed", "minor")], penalties)).toBe(95); // C13-like
    expect(weightedScore([r("passed"), r("failed", "severe")], penalties)).toBe(75); // C11-like
  });
  it("never goes below 0", () => {
    expect(weightedScore(Array.from({ length: 5 }, () => r("failed", "severe")), penalties)).toBe(0);
  });
  it("is null when nothing applied", () => {
    expect(weightedScore([r("not_applicable")], penalties)).toBeNull();
  });
});

describe("aggregate severeFailureRate", () => {
  it("is the % of evaluated conversations with at least one severe failure", () => {
    const conv = (severity: "none" | "minor" | "severe") =>
      ({ conversationId: severity, status: "ok", score: 100, weightedScore: 100, severity, rules: [] }) as never;
    const summary = aggregate([], [conv("none"), conv("minor"), conv("severe"), conv("severe")]);
    expect(summary.severeFailureRate).toBe(50);
    expect(summary.minorFailureRate).toBe(25); // worst failure minor; severe ones not double-counted
  });
});
