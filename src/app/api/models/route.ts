import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { listModels } from "@/lib/llm/models";

export const GET = route(async () => NextResponse.json({ models: listModels() }));
