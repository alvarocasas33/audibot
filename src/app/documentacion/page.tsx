import type { Metadata } from "next";
import Link from "next/link";
import { SwaggerUI } from "./swagger-ui";

export const metadata: Metadata = { title: "Documentación · Audibot" };

const CURL = `curl -X POST "https://audibot.vercel.app/api/evaluate/batch?language=es" \\
  -H "Authorization: Bearer $AUDIBOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  --data-binary @conversaciones_prueba_fde.json`;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
        {n}
      </span>
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm text-ink-2">{children}</div>
      </div>
    </li>
  );
}

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentación de la API</h1>
        <p className="text-sm text-ink-2">
          Evalúa conversaciones de un agente de IA contra una rúbrica de reglas de negocio. Cada regla recibe{" "}
          <code>passed</code> / <code>failed</code> / <code>not_applicable</code>, una severidad si falla (
          <code>minor</code> / <code>severe</code>) y citas textuales de la transcripción como evidencia.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-2">Primeros pasos</h2>
          <ol className="space-y-4">
            <Step n={1} title="Autenticación">
              Todas las llamadas requieren el header <code>Authorization: Bearer &lt;API key&gt;</code>. En Swagger,
              pulsa <strong>Authorize</strong> y pega la key.
            </Step>
            <Step n={2} title="Evaluar el archivo completo">
              <code>POST /api/evaluate/batch</code> con el JSON tal cual lo entrega el cliente. En Swagger el ejemplo
              ya trae las 20 conversaciones: <strong>Try it out → Execute</strong>.
            </Step>
            <Step n={3} title="Parámetros opcionales">
              <code>rubric</code> (por defecto la predeterminada), <code>model</code> (ver{" "}
              <code>GET /api/models</code>), <code>language</code> (<code>es</code> | <code>en</code>),{" "}
              <code>fresh=true</code> para ignorar la caché.
            </Step>
            <Step n={4} title="Errores">
              Siempre JSON <code>{"{ error, details? }"}</code>: 400 entrada inválida, 401 key, 404 rúbrica, 409
              conflicto. Si el LLM falla en una conversación, esa conversación vuelve con{" "}
              <code>status: &quot;error&quot;</code> y el resto del lote continúa.
            </Step>
          </ol>
        </section>

        <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">Ejemplo</h2>
          <pre className="overflow-x-auto rounded-md bg-page p-3 font-mono text-xs leading-relaxed">{CURL}</pre>
          <p className="text-sm text-ink-2">
            La respuesta es el reporte completo (mismo formato que <code>results.json</code>) y queda guardado en{" "}
            <Link href="/reportes" className="text-accent hover:underline">
              Reportes
            </Link>
            ; su id viene en el header <code>X-Report-Id</code>. Especificación OpenAPI:{" "}
            <a href="/api/openapi.json" className="text-accent hover:underline">
              /api/openapi.json
            </a>
            .
          </p>
        </section>
      </div>

      <SwaggerUI />
    </div>
  );
}
