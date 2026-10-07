import { NextResponse } from "next/server";
import { getRubric } from "@/lib/db/rubrics";
import { getSettings } from "@/lib/db/settings";
import { badRequest } from "@/lib/errors";
import { evaluateBatch } from "@/lib/eval/evaluate";
import { parseBody, readEvaluationParams, readJsonBody, route } from "@/lib/http";
import { resolveModel } from "@/lib/llm/models";
import { DatasetSchema } from "@/lib/schemas/dataset";

export const maxDuration = 300;

const MAX_CONVERSATIONS = 50;

/** Evaluates a whole file (agent spec + conversations) as uploaded by the client. */
export const POST = route(async (request) => {
  const params = readEvaluationParams(request);
  const { id: modelId, model } = resolveModel(params.model);
  const dataset = parseBody(DatasetSchema, await readJsonBody(request));
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

  const download = request.nextUrl.searchParams.get("download") === "true";
  return NextResponse.json(report, {
    headers: download ? { "Content-Disposition": 'attachment; filename="results.json"' } : {},
  });
});
