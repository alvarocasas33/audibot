import { readFile, writeFile } from "node:fs/promises";
import { getRubric } from "@/lib/db/rubrics";
import { getSettings } from "@/lib/db/settings";
import { evaluateBatch } from "@/lib/eval/evaluate";
import { resolveModel } from "@/lib/llm/models";
import { DatasetSchema } from "@/lib/schemas/dataset";
import type { Language } from "@/lib/schemas/report";

/**
 * Local runner, bypassing HTTP:
 *   npm run evaluate -- <file.json> [--ids C01,C20] [--model id] [--rubric name] [--language en]
 *                       [--per-request 5] [--fresh] [--out out.json]
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run evaluate -- <file.json> [options]");
  const dataset = DatasetSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const ids = arg("ids")?.split(",");
  const conversations = ids
    ? dataset.conversaciones.filter((c) => ids.includes(c.id))
    : dataset.conversaciones;

  const { id: modelId, model } = resolveModel(arg("model"));
  const rubric = await getRubric(arg("rubric"));
  const settings = await getSettings();
  const perRequest = Number(arg("per-request") ?? settings.conversationsPerRequest);
  const report = await evaluateBatch(
    conversations,
    {
      model,
      modelId,
      rubricName: rubric.name,
      rubric: rubric.content,
      language: (arg("language") ?? "es") as Language,
      fresh: process.argv.includes("--fresh"),
      evidence: settings.evidence,
    },
    perRequest,
  );

  const out = arg("out") ?? "results.local.json";
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(
    `Wrote ${out} — ${report.meta.evaluatedCount} ok (${report.meta.cachedCount} cached), ` +
      `${report.meta.errorCount} errors, ${report.meta.durationMs} ms, ` +
      `tokens in/out ${report.meta.tokenUsage.inputTokens}/${report.meta.tokenUsage.outputTokens}`,
  );
  for (const c of report.conversations) {
    const failed = c.rules
      .filter((r) => r.verdict === "failed")
      .map((r) => `${r.id}(${r.subRules.filter((s) => s.verdict === "failed").map((s) => s.id).join(",")})`);
    console.log(`${c.conversationId} ${c.status} score=${c.score} sev=${c.severity} failed=[${failed.join(" ")}]${c.error ? " ERROR " + c.error : ""}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
