import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { buildOpenApiDocument } from "@/lib/openapi";

/** The spec itself is public so the docs page loads; every documented endpoint needs the key. */
export const GET = route(
  async (request) => NextResponse.json(buildOpenApiDocument(request.nextUrl.origin)),
  { public: true },
);
