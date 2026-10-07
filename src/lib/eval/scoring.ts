import type {
  BatchReport,
  ConversationReport,
  RuleResult,
  SubRuleResult,
  Verdict,
} from "@/lib/schemas/report";
import type { Rule, Severity } from "@/lib/schemas/rubric";

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A rule passes only if no sub-rule failed and at least one passed.
 * Any failed sub-rule fails the rule; all not_applicable → not_applicable.
 */
export function combineVerdicts(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("failed")) return "failed";
  if (verdicts.includes("passed")) return "passed";
  return "not_applicable";
}

export function worstSeverity(severities: (Severity | null)[]): Severity | null {
  if (severities.includes("severe")) return "severe";
  if (severities.includes("minor")) return "minor";
  return null;
}

export function buildRuleResult(rule: Rule, subRules: SubRuleResult[]): RuleResult {
  const verdict = combineVerdicts(subRules.map((s) => s.verdict));
  return {
    id: rule.id,
    text: rule.text,
    verdict,
    severity: verdict === "failed" ? worstSeverity(subRules.map((s) => s.severity)) : null,
    subRules,
  };
}

/**
 * Severity-weighted score: starts at 100 and subtracts a penalty for each failed rule
 * according to its severity, floored at 0. Null when no rule applied.
 */
export function weightedScore(
  rules: RuleResult[],
  penalties: { minorPenalty: number; severePenalty: number },
): number | null {
  if (!rules.some((r) => r.verdict !== "not_applicable")) return null;
  const lost = rules
    .filter((r) => r.verdict === "failed")
    .reduce((sum, r) => sum + (r.severity === "severe" ? penalties.severePenalty : penalties.minorPenalty), 0);
  return Math.max(0, 100 - lost);
}

export function scoreConversation(rules: RuleResult[]) {
  const counts = { passed: 0, failed: 0, notApplicable: 0 };
  for (const rule of rules) {
    if (rule.verdict === "passed") counts.passed++;
    else if (rule.verdict === "failed") counts.failed++;
    else counts.notApplicable++;
  }
  const applicable = counts.passed + counts.failed;
  return {
    counts,
    score: applicable === 0 ? null : round1((counts.passed / applicable) * 100),
    severity: worstSeverity(rules.map((r) => r.severity)) ?? ("none" as const),
  };
}

export function aggregate(
  rules: Rule[],
  conversations: ConversationReport[],
  topN = 3,
): BatchReport["summary"] {
  const evaluated = conversations.filter((c) => c.status === "ok");

  const scores = evaluated.map((c) => c.score).filter((s): s is number => s !== null);
  const globalScore = scores.length
    ? round1(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const severityDistribution = { none: 0, minor: 0, severe: 0 };
  for (const c of evaluated) {
    if (c.severity) severityDistribution[c.severity]++;
  }

  const ruleCompliance = rules.map((rule) => {
    const stats = { passed: 0, failed: 0, notApplicable: 0, severeFailures: 0 };
    for (const c of evaluated) {
      const result = c.rules.find((r) => r.id === rule.id);
      if (!result) continue;
      if (result.verdict === "passed") stats.passed++;
      else if (result.verdict === "failed") {
        stats.failed++;
        if (result.severity === "severe") stats.severeFailures++;
      } else stats.notApplicable++;
    }
    const applicable = stats.passed + stats.failed;
    return {
      ruleId: rule.id,
      text: rule.text,
      ...stats,
      complianceRate: applicable === 0 ? null : round1((stats.passed / applicable) * 100),
    };
  });

  // Most frequent failures at sub-rule level: that's the actionable unit to fix.
  const failures = new Map<string, BatchReport["summary"]["topFailures"][number]>();
  for (const c of evaluated) {
    for (const rule of c.rules) {
      for (const sub of rule.subRules) {
        if (sub.verdict !== "failed" || !sub.severity) continue;
        const entry = failures.get(sub.id) ?? {
          ruleId: rule.id,
          subRuleId: sub.id,
          description: sub.description,
          severity: sub.severity,
          count: 0,
          conversationIds: [],
        };
        entry.count++;
        entry.conversationIds.push(c.conversationId);
        failures.set(sub.id, entry);
      }
    }
  }
  const severityRank = { severe: 1, minor: 0 };
  const topFailures = [...failures.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        severityRank[b.severity] - severityRank[a.severity] ||
        a.subRuleId.localeCompare(b.subRuleId, undefined, { numeric: true }),
    )
    .slice(0, topN);

  const weighted = evaluated.map((c) => c.weightedScore).filter((s): s is number => s !== null);
  const globalWeightedScore = weighted.length
    ? round1(weighted.reduce((a, b) => a + b, 0) / weighted.length)
    : null;

  const severeFailureRate = evaluated.length
    ? round1((severityDistribution.severe / evaluated.length) * 100)
    : null;

  return { globalScore, globalWeightedScore, severeFailureRate, severityDistribution, ruleCompliance, topFailures };
}
