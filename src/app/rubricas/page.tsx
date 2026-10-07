import Link from "next/link";
import { connection } from "next/server";
import { formatDate } from "@/components/badges";
import { listRubrics } from "@/lib/db/rubrics";

export default async function RubricsPage() {
  await connection();
  const rubrics = await listRubrics();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rúbricas</h1>
          <p className="text-sm text-ink-2">Criterios con los que se evalúan las conversaciones.</p>
        </div>
        <Link
          href="/rubricas/nueva"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Nueva rúbrica
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Reglas</th>
              <th className="px-4 py-3 font-medium">Actualizada</th>
              <th className="px-4 py-3 font-medium">Editar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rubrics.map((r) => (
              <tr key={r.name} className="hover:bg-page">
                <td className="px-4 py-3">
                  <span className="font-medium">{r.name}</span>
                  {r.isDefault && <span className="ml-2 text-xs text-muted">predeterminada</span>}
                  {r.description && <div className="text-xs text-ink-2">{r.description}</div>}
                </td>
                <td className="px-4 py-3 text-ink-2">
                  {r.ruleCount} reglas · {r.subRuleCount} sub-reglas
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-2">{formatDate(r.updatedAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/rubricas/${encodeURIComponent(r.name)}`} className="text-accent hover:underline">
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
