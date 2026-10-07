import { z } from "zod";
import sample from "../../data/conversaciones_prueba_fde.json";
import { ConversationSchema, DatasetSchema } from "@/lib/schemas/dataset";
import { BatchReportSchema, ConversationReportSchema } from "@/lib/schemas/report";
import { RubricContentSchema, RubricSchema } from "@/lib/schemas/rubric";
import { SettingsPatchSchema, SettingsSchema } from "@/lib/schemas/settings";

/** JSON Schema from the same Zod schemas that validate requests and responses at runtime. */
function schema(type: z.ZodType, io: "input" | "output" = "output") {
  const json: Record<string, unknown> = z.toJSONSchema(type, { io, unrepresentable: "any" });
  delete json.$schema; // OpenAPI 3.1 components don't carry their own dialect
  return json;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (s: object, example?: unknown) => ({
  "application/json": { schema: s, ...(example !== undefined ? { example } : {}) },
});

const errorResponses = {
  "400": { description: "Invalid input", content: json(ref("Error")) },
  "401": { description: "Missing or invalid API key", content: json(ref("Error")) },
  "500": { description: "Unexpected error (always JSON, never a crash)", content: json(ref("Error")) },
};

const evaluationParams = [
  {
    name: "rubric",
    in: "query",
    description: "Rubric name. Defaults to the rubric marked as default (Banco_Andino_01).",
    schema: { type: "string" },
  },
  {
    name: "model",
    in: "query",
    description: "Model id from GET /api/models. Defaults to google/gemini-3.5-flash-lite.",
    schema: { type: "string" },
  },
  {
    name: "language",
    in: "query",
    description: "Language of explanations.",
    schema: { type: "string", enum: ["es", "en"], default: "es" },
  },
  {
    name: "fresh",
    in: "query",
    description:
      "Ignore cached results and call the LLM again. By default, a conversation already evaluated with the same rubric, model and language is served from cache.",
    schema: { type: "boolean", default: false },
  },
];

const rubricName = { name: "name", in: "path", required: true, schema: { type: "string" }, example: "Banco_Andino_01" };

export function buildOpenApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Audibot API",
      version: "1.0.0",
      description:
        "Evaluates AI agent conversations against a rubric of business rules. Every rule gets " +
        "`passed` / `failed` / `not_applicable`, a severity when it fails (`minor` / `severe`), " +
        "and verbatim transcript quotes as evidence.\n\n" +
        "**Authentication:** every endpoint requires `Authorization: Bearer <API key>`. " +
        "Click **Authorize** and paste the key.",
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Evaluation" },
      { name: "Rubrics" },
      { name: "Configuration" },
    ],
    paths: {
      "/api/evaluate": {
        post: {
          tags: ["Evaluation"],
          summary: "Evaluate one conversation",
          description: "Body: one item of `conversaciones` from the input file.",
          parameters: evaluationParams,
          requestBody: { required: true, content: json(ref("Conversation"), sample.conversaciones[19]) },
          responses: {
            "200": { description: "Conversation report", content: json(ref("ConversationReport")) },
            ...errorResponses,
          },
        },
      },
      "/api/evaluate/batch": {
        post: {
          tags: ["Evaluation"],
          summary: "Evaluate a whole file",
          description:
            "Body: the client's file as-is (agent spec + conversations), as JSON or as a multipart upload in a `file` field. " +
            "The pre-filled example is the 20-conversation test file. The result is also saved as a report " +
            "(see the Reportes section of the UI); its id is returned in `X-Report-Id`.",
          parameters: [
            ...evaluationParams,
            {
              name: "download",
              in: "query",
              description: "Return the report as a `results.json` attachment.",
              schema: { type: "boolean", default: false },
            },
          ],
          requestBody: {
            required: true,
            content: {
              ...json(ref("Dataset"), sample),
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: { file: { type: "string", format: "binary" } },
                  required: ["file"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Batch report",
              headers: { "X-Report-Id": { schema: { type: "string" }, description: "Id of the stored report" } },
              content: json(ref("BatchReport")),
            },
            ...errorResponses,
          },
        },
      },
      "/api/models": {
        get: {
          tags: ["Evaluation"],
          summary: "List models",
          description: "`available` is false when the server has no API key for that provider.",
          responses: { "200": { description: "Models" }, "401": errorResponses["401"] },
        },
      },
      "/api/rubrics": {
        get: {
          tags: ["Rubrics"],
          summary: "List rubrics",
          responses: { "200": { description: "Rubric summaries" }, "401": errorResponses["401"] },
        },
        post: {
          tags: ["Rubrics"],
          summary: "Create a rubric",
          requestBody: { required: true, content: json(ref("Rubric")) },
          responses: {
            "201": { description: "Created", content: json(ref("Rubric")) },
            "409": { description: "Name already exists", content: json(ref("Error")) },
            ...errorResponses,
          },
        },
      },
      "/api/rubrics/{name}": {
        get: {
          tags: ["Rubrics"],
          summary: "Get a rubric",
          parameters: [rubricName],
          responses: {
            "200": { description: "Rubric", content: json(ref("Rubric")) },
            "404": { description: "Not found", content: json(ref("Error")) },
            "401": errorResponses["401"],
          },
        },
        put: {
          tags: ["Rubrics"],
          summary: "Replace a rubric (can rename it)",
          parameters: [rubricName],
          requestBody: { required: true, content: json(ref("Rubric")) },
          responses: {
            "200": { description: "Updated", content: json(ref("Rubric")) },
            "404": { description: "Not found", content: json(ref("Error")) },
            ...errorResponses,
          },
        },
        delete: {
          tags: ["Rubrics"],
          summary: "Delete a rubric",
          description: "The default rubric cannot be deleted.",
          parameters: [rubricName],
          responses: {
            "204": { description: "Deleted" },
            "409": { description: "It is the default rubric", content: json(ref("Error")) },
            "401": errorResponses["401"],
          },
        },
      },
      "/api/rubrics/generate": {
        post: {
          tags: ["Rubrics"],
          summary: "Propose a rubric from a file (not saved)",
          description:
            "Reads the rules (R1…Rn) from `especificacion_agente.reglas` and the customer data fields, " +
            "and asks the LLM to split each rule into sub-rules with a suggested severity and evaluation method.",
          parameters: evaluationParams.filter((p) => p.name === "model" || p.name === "language"),
          requestBody: { required: true, content: json(ref("Dataset"), sample) },
          responses: {
            "200": {
              description: "Draft rubric content and warnings",
              content: json({
                type: "object",
                properties: { content: ref("RubricContent"), warnings: { type: "array", items: { type: "string" } } },
              }),
            },
            ...errorResponses,
          },
        },
      },
      "/api/settings": {
        get: {
          tags: ["Configuration"],
          summary: "Get settings",
          responses: { "200": { description: "Settings", content: json(ref("Settings")) }, "401": errorResponses["401"] },
        },
        patch: {
          tags: ["Configuration"],
          summary: "Update settings (partial)",
          requestBody: { required: true, content: json(schema(SettingsPatchSchema, "input"), { conversationsPerRequest: 5 }) },
          responses: { "200": { description: "Settings", content: json(ref("Settings")) }, ...errorResponses },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" }, details: {} },
          required: ["error"],
        },
        Conversation: schema(ConversationSchema, "input"),
        Dataset: schema(DatasetSchema, "input"),
        ConversationReport: schema(ConversationReportSchema),
        BatchReport: schema(BatchReportSchema),
        Rubric: schema(RubricSchema, "input"),
        RubricContent: schema(RubricContentSchema),
        Settings: schema(SettingsSchema),
      },
    },
  };
}
