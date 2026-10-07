import { connection } from "next/server";
import { formatDate } from "@/components/badges";
import { listRubrics } from "@/lib/db/rubrics";

export default async function RubricsPage() {
  await connection();
  const rubrics = await listRubrics();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rúbricas</h1>
        <p className="text-sm text-ink-2">Rúbricas guardadas. El editor llega en el siguiente paso.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Reglas</th>
              <th className="px-4 py-3 font-medium">Actualizada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rubrics.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-3">
                  <span className="font-medium">{r.name}</span>
                  {r.isDefault && <span className="ml-2 text-xs text-muted">predeterminada</span>}
                  {r.description && <div className="text-xs text-ink-2">{r.description}</div>}
                </td>
                <td className="px-4 py-3 text-ink-2">
                  {r.ruleCount} reglas · {r.subRuleCount} sub-reglas
                </td>
                <td className="px-4 py-3 text-ink-2">{formatDate(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
