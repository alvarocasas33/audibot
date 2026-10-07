import { NextResponse } from "next/server";
import { createRubric, listRubrics } from "@/lib/db/rubrics";
import { parseBody, readJsonBody, route } from "@/lib/http";
import { RubricSchema } from "@/lib/schemas/rubric";

export const GET = route(async () => NextResponse.json({ rubrics: await listRubrics() }));

export const POST = route(async (request) => {
  const rubric = parseBody(RubricSchema, await readJsonBody(request));
  return NextResponse.json(await createRubric(rubric), { status: 201 });
});
