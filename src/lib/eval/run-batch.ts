import { saveReport } from "@/lib/db/reports";
import { getRubric } from "@/lib/db/rubrics";
import { getSettings } from "@/lib/db/settings";
import { badRequest } from "@/lib/errors";
import { resolveModel } from "@/lib/llm/models";
import type { Dataset } from "@/lib/schemas/dataset";
import type { Language } from "@/lib/schemas/report";
import { evaluateBatch } from "./evaluate";

export const MAX_CONVERSATIONS = 50;

/** Shared by the API and the UI: evaluate a whole file and store it as a report. */
export async function runBatchEvaluation(
  dataset: Dataset,
  params: { rubric: string | null; model: string | null; language: Language; fresh: boolean },
  sourceName: string | null,
) {
  const { id: modelId, model } = resolveModel(params.model);
  if (dataset.conversaciones.length > MAX_CONVERSATIONS) {
    throw badRequest(`At most ${MAX_CONVERSATIONS} conversations per request`);
  }
  const [rubric, settings] = await Promise.all([getRubric(params.rubric), getSettings()]);

  const report = await evaluateBatch(
    dataset.conversaciones,
    {
      model,
      modelId,
      rubricName: rubric.name,
      rubric: rubric.content,
      language: params.language,
      fresh: params.fresh,
    },
    settings.conversationsPerRequest,
  );
  const id = await saveReport(report, sourceName);
  return { id, report };
}
