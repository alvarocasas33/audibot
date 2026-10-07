import { NextResponse } from "next/server";
import { parseBody, readEvaluationParams, readJsonBody, route } from "@/lib/http";
import { resolveModel } from "@/lib/llm/models";
import { generateRubricDraft } from "@/lib/rubric/generate";
import { DatasetSchema } from "@/lib/schemas/dataset";

export const maxDuration = 120;

/**
 * Proposes a rubric (not saved) from an uploaded file: rules are read from
 * `especificacion_agente.reglas`, customer fields from `datos_cliente`.
 */
export const POST = route(async (request) => {
  const { model: modelParam, language } = readEvaluationParams(request);
  const { model } = resolveModel(modelParam);
  const dataset = parseBody(DatasetSchema, await readJsonBody(request));
  const customerFields = [
    ...new Set(dataset.conversaciones.flatMap((c) => Object.keys(c.datos_cliente))),
  ];

  const draft = await generateRubricDraft({
    model,
    agentSpec: dataset.especificacion_agente,
    customerFields,
    language,
  });
  return NextResponse.json(draft);
});
