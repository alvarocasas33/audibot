import Link from "next/link";
import { connection } from "next/server";
import { formatDate, formatScore } from "@/components/badges";
import { listReports } from "@/lib/db/reports";

export default async function ReportsPage() {
  await connection();
  const reports = await listReports();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-ink-2">Todas las evaluaciones generadas, desde la interfaz o la API.</p>
        </div>
        <Link
          href="/reportes/nuevo"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Nuevo reporte
        </Link>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-8 text-center text-sm text-ink-2">
          Aún no hay reportes. Crea el primero subiendo un archivo de conversaciones.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Rúbrica</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 text-right font-medium">Nota ponderada</th>
                <th className="px-4 py-3 text-right font-medium">Cumplimiento</th>
                <th className="px-4 py-3 font-medium">Descargar</th>
                <th className="px-4 py-3 font-medium">Abrir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-page">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.rubricName}</div>
                    <div className="text-xs text-muted">
                      {r.conversationCount} conversaciones · {r.model.split("/")[1]} · {r.language}
                      {r.sourceName ? ` · ${r.sourceName}` : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-2">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-right font-mono text-base font-semibold tabular-nums">
                    {formatScore(r.globalWeightedScore)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-2">
                    {formatScore(r.globalScore)}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/reportes/${r.id}/descargar`} className="text-accent hover:underline">
                      JSON
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/reportes/${r.id}`} className="text-accent hover:underline">
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
