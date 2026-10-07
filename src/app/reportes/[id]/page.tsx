import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { formatDate } from "@/components/badges";
import { getReport } from "@/lib/db/reports";
import { HttpError } from "@/lib/errors";
import { ReportView } from "./report-view";

export default async function ReportPage({ params }: PageProps<"/reportes/[id]">) {
  await connection();
  const { id } = await params;
  const row = await getReport(id).catch((error) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
  const { meta } = row.report;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/reportes" className="text-sm text-ink-2 hover:text-ink">
            ← Reportes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{meta.rubric}</h1>
          <p className="text-sm text-ink-2">
            {formatDate(row.createdAt)} · {meta.model} · {meta.language === "es" ? "Español" : "English"}
            {row.sourceName ? ` · ${row.sourceName}` : ""}
          </p>
        </div>
        <a
          href={`/reportes/${id}/descargar`}
          className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-page"
        >
          Descargar JSON
        </a>
      </div>
      <ReportView report={row.report} />
    </div>
  );
}
