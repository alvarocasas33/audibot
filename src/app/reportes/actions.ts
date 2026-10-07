"use server";

import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { runBatchEvaluation } from "@/lib/eval/run-batch";
import { ModelError } from "@/lib/llm/models";
import { DatasetSchema } from "@/lib/schemas/dataset";
import { LanguageSchema } from "@/lib/schemas/report";

const InputSchema = z.object({
  fileText: z.string().min(1),
  fileName: z.string().max(200).nullable(),
  rubric: z.string().nullable(),
  model: z.string().nullable(),
  language: LanguageSchema,
});

export type CreateReportResult = { ok: true; id: string } | { ok: false; error: string };

/** Runs inside the server, so the UI never needs (or exposes) the API key. */
export async function createReport(input: z.infer<typeof InputSchema>): Promise<CreateReportResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Parámetros inválidos." };
  const { fileText, fileName, ...params } = parsed.data;

  let json: unknown;
  try {
    json = JSON.parse(fileText);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }
  const dataset = DatasetSchema.safeParse(json);
  if (!dataset.success) {
    const issue = dataset.error.issues[0];
    return {
      ok: false,
      error: `El archivo no tiene el formato esperado (${issue.path.join(".") || "raíz"}: ${issue.message}).`,
    };
  }

  try {
    const { id } = await runBatchEvaluation(dataset.data, { ...params, fresh: false }, fileName);
    return { ok: true, id };
  } catch (error) {
    if (error instanceof HttpError || error instanceof ModelError) {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: "Error inesperado al evaluar. Intenta de nuevo." };
  }
}
