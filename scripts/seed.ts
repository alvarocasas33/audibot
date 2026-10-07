import { createRubric, getRubric, updateRubric } from "@/lib/db/rubrics";
import { BANCO_ANDINO_01 } from "@/lib/rubric/banco-andino-01";
import { RubricSchema } from "@/lib/schemas/rubric";

/** Creates Banco_Andino_01, or resets it to the version in code with --force. */
async function main() {
  const rubric = RubricSchema.parse(BANCO_ANDINO_01);
  const force = process.argv.includes("--force");
  const exists = await getRubric(rubric.name).then(
    () => true,
    () => false,
  );
  if (exists && !force) {
    console.log(`${rubric.name} already exists (use --force to overwrite)`);
    return;
  }
  await (exists ? updateRubric(rubric.name, rubric) : createRubric(rubric));
  console.log(`${exists ? "Updated" : "Created"} ${rubric.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
