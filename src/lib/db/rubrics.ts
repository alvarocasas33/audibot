import { asc, desc, eq, ne } from "drizzle-orm";
import { conflict, notFound } from "@/lib/errors";
import type { Rubric } from "@/lib/schemas/rubric";
import { getDb } from "./index";
import { rubrics, type RubricRow } from "./schema";

export interface StoredRubric extends Rubric {
  createdAt: string;
  updatedAt: string;
}

function toRubric(row: RubricRow): StoredRubric {
  return {
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return (error as { code?: string })?.code === "23505" || cause?.code === "23505";
}

export async function listRubrics() {
  const rows = await getDb()
    .select()
    .from(rubrics)
    .orderBy(desc(rubrics.isDefault), asc(rubrics.name));
  return rows.map((row) => ({
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    ruleCount: row.content.rules.length,
    subRuleCount: row.content.rules.reduce((n, r) => n + r.subRules.length, 0),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Looks a rubric up by name; with no name, returns the default one. */
export async function getRubric(name?: string | null): Promise<StoredRubric> {
  const db = getDb();
  if (name) {
    const [row] = await db.select().from(rubrics).where(eq(rubrics.name, name));
    if (!row) throw notFound(`Rubric "${name}" not found`);
    return toRubric(row);
  }
  const [row] = await db
    .select()
    .from(rubrics)
    .orderBy(desc(rubrics.isDefault), asc(rubrics.createdAt))
    .limit(1);
  if (!row) throw notFound("No rubrics exist yet. Create one first.");
  return toRubric(row);
}

export async function createRubric(rubric: Rubric): Promise<StoredRubric> {
  const db = getDb();
  try {
    if (rubric.isDefault) {
      const [, [row]] = await db.batch([
        db.update(rubrics).set({ isDefault: false }).where(eq(rubrics.isDefault, true)),
        db.insert(rubrics).values(rubric).returning(),
      ]);
      return toRubric(row);
    }
    const [row] = await db.insert(rubrics).values(rubric).returning();
    return toRubric(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(`A rubric named "${rubric.name}" already exists`);
    throw error;
  }
}

export async function updateRubric(name: string, rubric: Rubric): Promise<StoredRubric> {
  const db = getDb();
  const values = { ...rubric, updatedAt: new Date() };
  try {
    const update = db.update(rubrics).set(values).where(eq(rubrics.name, name)).returning();
    const [row] = rubric.isDefault
      ? (
          await db.batch([
            db
              .update(rubrics)
              .set({ isDefault: false })
              .where(ne(rubrics.name, name)),
            update,
          ])
        )[1]
      : await update;
    if (!row) throw notFound(`Rubric "${name}" not found`);
    return toRubric(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(`A rubric named "${rubric.name}" already exists`);
    throw error;
  }
}

export async function deleteRubric(name: string): Promise<void> {
  const db = getDb();
  const existing = await getRubric(name);
  if (existing.isDefault) {
    throw conflict("The default rubric cannot be deleted. Make another rubric the default first.");
  }
  await db.delete(rubrics).where(eq(rubrics.name, name));
}
