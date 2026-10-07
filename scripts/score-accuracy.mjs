// Compares evaluation results against the hand-labeled gold set at rule level.
// A "positive" is a rule that fails: precision = how many reported failures are real,
// recall = how many real failures were caught.
// Usage: node scripts/score-accuracy.mjs results.json [more-results.json ...]
import { readFileSync } from "node:fs";

const gold = JSON.parse(readFileSync("data/expected-failures.json", "utf8")).failedRules;
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

for (const file of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(file, "utf8"));
  let tp = 0, fp = 0, fn = 0, exact = 0;
  const diffs = [];
  for (const [id, expected] of Object.entries(gold)) {
    const conversation = report.conversations.find((c) => c.conversationId === id);
    if (!conversation || conversation.status !== "ok") {
      fn += expected.length;
      diffs.push(`${id}: not evaluated`);
      continue;
    }
    const got = conversation.rules.filter((r) => r.verdict === "failed").map((r) => r.id);
    const falsePositives = got.filter((r) => !expected.includes(r));
    const misses = expected.filter((r) => !got.includes(r));
    tp += got.length - falsePositives.length;
    fp += falsePositives.length;
    fn += misses.length;
    if (!falsePositives.length && !misses.length) exact++;
    if (falsePositives.length) diffs.push(`${id}: false positive ${falsePositives.join(", ")}`);
    if (misses.length) diffs.push(`${id}: missed ${misses.join(", ")}`);
  }
  const total = Object.keys(gold).length;
  console.log(`\n${file} (${report.meta.model})`);
  console.log(`  precision ${pct(tp, tp + fp)}  recall ${pct(tp, tp + fn)}  conversations exact ${exact}/${total}`);
  console.log(`  tokens in/out ${report.meta.tokenUsage?.inputTokens ?? "?"}/${report.meta.tokenUsage?.outputTokens ?? "?"}  duration ${report.meta.durationMs} ms`);
  for (const d of diffs) console.log(`  - ${d}`);
}
