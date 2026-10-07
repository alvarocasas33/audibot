import Link from "next/link";
import { connection } from "next/server";
import { listModels } from "@/lib/llm/models";
import { RubricCreator } from "./rubric-creator";

// The sub-rule proposal runs in a Server Action on this page.
export const maxDuration = 120;

export default async function NewRubricPage() {
  // Rendered per request: model availability depends on the server's env vars.
  await connection();
  const models = listModels().filter((m) => m.available);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/rubricas" className="text-sm text-ink-2 hover:text-ink">
          ← Rúbricas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nueva rúbrica</h1>
      </div>
      <RubricCreator models={models} />
    </div>
  );
}
