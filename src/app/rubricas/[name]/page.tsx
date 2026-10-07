import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRubric } from "@/lib/db/rubrics";
import { HttpError } from "@/lib/errors";
import { RubricEditor } from "../rubric-editor";

export default async function EditRubricPage({ params }: PageProps<"/rubricas/[name]">) {
  await connection();
  const { name } = await params;
  const stored = await getRubric(decodeURIComponent(name)).catch((error) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
  const rubric = {
    name: stored.name,
    description: stored.description,
    isDefault: stored.isDefault,
    content: stored.content,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/rubricas" className="text-sm text-ink-2 hover:text-ink">
          ← Rúbricas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar {rubric.name}</h1>
        <p className="text-sm text-ink-2">
          Cambiar una rúbrica no altera los reportes ya generados; las nuevas evaluaciones usarán esta versión.
        </p>
      </div>
      <RubricEditor initial={rubric} originalName={rubric.name} />
    </div>
  );
}
