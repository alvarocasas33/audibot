import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { notFound } from "@/lib/errors";
import type { BatchReport } from "@/lib/schemas/report";
import { getDb } from "./index";
import { reports } from "./schema";

export async function saveReport(report: BatchReport, sourceName: string | null): Promise<string> {
  const id = randomUUID();
  await getDb().insert(reports).values({
    id,
    rubricName: report.meta.rubric,
    model: report.meta.model,
    language: report.meta.language,
    sourceName,
    globalScore: report.summary.globalScore,
    globalWeightedScore: report.summary.globalWeightedScore,
    conversationCount: report.meta.conversationCount,
    report,
  });
  return id;
}

export async function listReports() {
  return getDb()
    .select({
      id: reports.id,
      rubricName: reports.rubricName,
      model: reports.model,
      language: reports.language,
      sourceName: reports.sourceName,
      globalScore: reports.globalScore,
      globalWeightedScore: reports.globalWeightedScore,
      conversationCount: reports.conversationCount,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .orderBy(desc(reports.createdAt));
}

export async function getReport(id: string) {
  const [row] = await getDb().select().from(reports).where(eq(reports.id, id));
  if (!row) throw notFound(`Report "${id}" not found`);
  return row;
}
