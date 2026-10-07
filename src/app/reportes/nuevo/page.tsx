import Link from "next/link";
import { connection } from "next/server";
import { listRubrics } from "@/lib/db/rubrics";
import { listModels } from "@/lib/llm/models";
import { NewReportForm } from "./new-report-form";

// The evaluation runs in a Server Action on this page.
export const maxDuration = 300;

export default async function NewReportPage() {
  await connection();
  const rubrics = await listRubrics();
  const models = listModels().filter((m) => m.available);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/reportes" className="text-sm text-ink-2 hover:text-ink">
          ← Reportes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo reporte</h1>
        <p className="text-sm text-ink-2">
          Sube el archivo JSON con la especificación del agente y las conversaciones.
        </p>
      </div>
      <NewReportForm rubrics={rubrics} models={models} />
    </div>
  );
}
