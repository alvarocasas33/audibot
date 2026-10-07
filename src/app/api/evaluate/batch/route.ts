import { NextResponse } from "next/server";
import { runBatchEvaluation } from "@/lib/eval/run-batch";
import { parseBody, readEvaluationParams, readJsonBody, route } from "@/lib/http";
import { DatasetSchema } from "@/lib/schemas/dataset";

export const maxDuration = 300;

/** Evaluates a whole file (agent spec + conversations) as uploaded by the client. */
export const POST = route(async (request) => {
  const params = readEvaluationParams(request);
  const dataset = parseBody(DatasetSchema, await readJsonBody(request));
  const { id, report } = await runBatchEvaluation(dataset, params, "api");

  const download = request.nextUrl.searchParams.get("download") === "true";
  return NextResponse.json(report, {
    headers: {
      "X-Report-Id": id,
      ...(download ? { "Content-Disposition": 'attachment; filename="results.json"' } : {}),
    },
  });
});
