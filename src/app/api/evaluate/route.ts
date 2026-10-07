import { NextResponse } from "next/server";
import { getRubric } from "@/lib/db/rubrics";
import { evaluateConversation } from "@/lib/eval/evaluate";
import { parseBody, readEvaluationParams, readJsonBody, route } from "@/lib/http";
import { resolveModel } from "@/lib/llm/models";
import { ConversationSchema } from "@/lib/schemas/dataset";

export const maxDuration = 300;

/** Evaluates a single conversation (an item of `conversaciones`). */
export const POST = route(async (request) => {
  const params = readEvaluationParams(request);
  const { id: modelId, model } = resolveModel(params.model);
  const conversation = parseBody(ConversationSchema, await readJsonBody(request));
  const rubric = await getRubric(params.rubric);

  const report = await evaluateConversation(conversation, {
    model,
    modelId,
    rubricName: rubric.name,
    rubric: rubric.content,
    language: params.language,
    fresh: params.fresh,
  });
  return NextResponse.json({ rubric: rubric.name, language: params.language, ...report });
});
