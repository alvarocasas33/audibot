import { NextResponse } from "next/server";
import { getReport } from "@/lib/db/reports";
import { HttpError } from "@/lib/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const row = await getReport(id);
    const date = row.createdAt.toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(row.report, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="results_${row.rubricName}_${date}.json"`,
      },
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json({ error: "Reporte no encontrado" }, { status });
  }
}
