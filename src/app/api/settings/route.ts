import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db/settings";
import { parseBody, readJsonBody, route } from "@/lib/http";
import { SettingsPatchSchema } from "@/lib/schemas/settings";

export const GET = route(async () => NextResponse.json(await getSettings()));

/** Partial update: only the fields sent are changed. */
export const PATCH = route(async (request) => {
  const patch = parseBody(SettingsPatchSchema, await readJsonBody(request));
  return NextResponse.json(await updateSettings(patch));
});
