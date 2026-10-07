import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

interface ModelEntry {
  label: string;
  provider: "google" | "anthropic";
  envKey: string;
  create: () => LanguageModel;
}

/**
 * Models we have verified produce valid structured output for this task.
 * Ids are "<provider>/<model>" so the API parameter is self-describing.
 */
const MODELS = {
  "google/gemini-3.5-flash": {
    label: "Gemini 3.5 Flash (free tier: 20 requests/day)",
    provider: "google",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    create: () => google("gemini-3.5-flash"),
  },
  "google/gemini-3.5-flash-lite": {
    label: "Gemini 3.5 Flash-Lite (free tier)",
    provider: "google",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    create: () => google("gemini-3.5-flash-lite"),
  },
  "anthropic/claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    provider: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    create: () => anthropic("claude-sonnet-5-5"),
  },
  "anthropic/claude-haiku-4-5": {
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    create: () => anthropic("claude-haiku-4-5"),
  },
} satisfies Record<string, ModelEntry>;

export type ModelId = keyof typeof MODELS;

export const DEFAULT_MODEL_ID: ModelId = "google/gemini-3.5-flash-lite";

export class ModelError extends Error {}

export function isModelId(id: string): id is ModelId {
  return Object.hasOwn(MODELS, id);
}

export function listModels() {
  return Object.entries(MODELS).map(([id, entry]) => ({
    id,
    label: entry.label,
    provider: entry.provider,
    available: Boolean(process.env[entry.envKey]),
    isDefault: id === DEFAULT_MODEL_ID,
  }));
}

/** Resolves an optional model id to a ready model, or throws a ModelError with a user-facing message. */
export function resolveModel(id: string | null | undefined): { id: ModelId; model: LanguageModel } {
  const modelId = id || DEFAULT_MODEL_ID;
  if (!isModelId(modelId)) {
    throw new ModelError(
      `Unknown model "${modelId}". Available: ${Object.keys(MODELS).join(", ")}`,
    );
  }
  const entry: ModelEntry = MODELS[modelId];
  if (!process.env[entry.envKey]) {
    throw new ModelError(`Model "${modelId}" is not configured on this server (${entry.envKey} missing).`);
  }
  return { id: modelId, model: entry.create() };
}
