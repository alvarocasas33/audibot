"use server";

import { revalidatePath } from "next/cache";
import { createRubric, deleteRubric, updateRubric } from "@/lib/db/rubrics";
import { HttpError } from "@/lib/errors";
import { ModelError, resolveModel } from "@/lib/llm/models";
import { generateRubricDraft, rulesOnlyDraft } from "@/lib/rubric/generate";
import { DatasetSchema } from "@/lib/schemas/dataset";
import { LanguageSchema } from "@/lib/schemas/report";
import { RubricSchema, type RubricContent } from "@/lib/schemas/rubric";

export type DraftResult =
  | { ok: true; content: RubricContent; customerFields: string[]; warnings: string[]; usedLlm: boolean }
  | { ok: false; error: string };

/** Reads R1…Rn from the uploaded file and asks the LLM to propose sub-rules. */
export async function draftFromFile(input: {
  fileText: string;
  model: string | null;
  language: string;
}): Promise<DraftResult> {
  let json: unknown;
  try {
    json = JSON.parse(input.fileText);
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
  const language = LanguageSchema.catch("es").parse(input.language);
  const agentSpec = dataset.data.especificacion_agente;
  const customerFields = [...new Set(dataset.data.conversaciones.flatMap((c) => Object.keys(c.datos_cliente)))];

  try {
    const { model } = resolveModel(input.model);
    const draft = await generateRubricDraft({ model, agentSpec, customerFields, language });
    return { ok: true, ...draft, customerFields, usedLlm: true };
  } catch (error) {
    // The rules are still useful without the LLM: load them and let the user finish by hand.
    console.error(error);
    const reason = error instanceof ModelError || error instanceof Error ? error.message : "error desconocido";
    return {
      ok: true,
      content: rulesOnlyDraft(agentSpec),
      customerFields,
      warnings: [`No se pudieron proponer sub-reglas con el LLM (${reason}). Se cargaron las reglas para completarlas a mano.`],
      usedLlm: false,
    };
  }
}

export async function saveRubric(input: {
  originalName: string | null;
  rubric: unknown;
}): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const parsed = RubricSchema.safeParse(input.rubric);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Revisa la rúbrica: ${issue.path.join(".")} — ${issue.message}` };
  }
  try {
    const saved = input.originalName
      ? await updateRubric(input.originalName, parsed.data)
      : await createRubric(parsed.data);
    revalidatePath("/rubricas");
    return { ok: true, name: saved.name };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Error inesperado al guardar." };
  }
}

export async function removeRubric(name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await deleteRubric(name);
    revalidatePath("/rubricas");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof HttpError ? error.message : "Error inesperado al eliminar." };
  }
}
