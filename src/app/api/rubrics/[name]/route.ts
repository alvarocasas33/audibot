import { NextResponse } from "next/server";
import { deleteRubric, getRubric, updateRubric } from "@/lib/db/rubrics";
import { parseBody, readJsonBody, route } from "@/lib/http";
import { RubricSchema } from "@/lib/schemas/rubric";

type Context = { params: Promise<{ name: string }> };

export const GET = route<Context>(async (_request, { params }) => {
  const { name } = await params;
  return NextResponse.json(await getRubric(name));
});

/** Replaces the rubric (the body may also rename it). */
export const PUT = route<Context>(async (request, { params }) => {
  const { name } = await params;
  const rubric = parseBody(RubricSchema, await readJsonBody(request));
  return NextResponse.json(await updateRubric(name, rubric));
});

export const DELETE = route<Context>(async (_request, { params }) => {
  const { name } = await params;
  await deleteRubric(name);
  return new NextResponse(null, { status: 204 });
});
