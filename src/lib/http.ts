import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { HttpError, badRequest } from "@/lib/errors";
import { ModelError } from "@/lib/llm/models";
import { LanguageSchema, type Language } from "@/lib/schemas/report";

export interface ErrorBody {
  error: string;
  details?: unknown;
}

export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.message, ...(error.details ? { details: error.details } : {}) },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", details: z.flattenError(error) },
      { status: 400 },
    );
  }
  if (error instanceof ModelError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

type Handler<C> = (request: NextRequest, context: C) => Promise<Response>;

/** Every route goes through this: known errors map to 4xx, anything else to a JSON 500. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Reads a JSON body, or the "file" field of a multipart upload. */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw badRequest('Upload the JSON file in a "file" field');
      return JSON.parse(await file.text());
    }
    return await request.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw badRequest("Request body is not valid JSON");
  }
}

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest("Input does not match the expected format", z.flattenError(result.error));
  }
  return result.data;
}

export interface EvaluationParams {
  rubric: string | null;
  model: string | null;
  language: Language;
  fresh: boolean;
}

export function readEvaluationParams(request: NextRequest): EvaluationParams {
  const params = request.nextUrl.searchParams;
  const language = params.get("language") || "es";
  const parsed = LanguageSchema.safeParse(language);
  if (!parsed.success) throw badRequest('language must be "es" or "en"');
  return {
    rubric: params.get("rubric") || null,
    model: params.get("model") || null,
    language: parsed.data,
    fresh: params.get("fresh") === "true",
  };
}
