import type { Job, Rephrased } from "./types";

/** Returns a list of problems. Empty list = safe to write. */
export function validateRephrased(job: Job, items: Rephrased[]): string[] {
  const problems: string[] = [];
  const byName = new Map(items.map((i) => [i.name, i]));

  if (byName.size !== items.length) problems.push("Duplicate field names in submission.");

  for (const f of job.fields) {
    const r = byName.get(f.name);
    if (!r) {
      problems.push(`Missing field: ${f.name}`);
      continue;
    }
    if (!r.question || r.question.trim().length < 20) {
      problems.push(`${f.name}: extraction prompt is empty or too short.`);
    }
    if (f.is_objective) {
      const oldVals = f.objective_options.map((o) => o.value);
      const newVals = (r.objective_options ?? []).map((o) => o.value);
      if (JSON.stringify(oldVals) !== JSON.stringify(newVals)) {
        problems.push(
          `${f.name}: answer values changed. Expected ${JSON.stringify(oldVals)}, got ${JSON.stringify(newVals)}.`
        );
      }
      (r.objective_options ?? []).forEach((o) => {
        if (!o.condition || !o.condition.trim()) problems.push(`${f.name}: value "${o.value}" has an empty condition.`);
      });
    }
  }

  const known = new Set(job.fields.map((f) => f.name));
  for (const i of items) if (!known.has(i.name)) problems.push(`Unknown field not in this job: ${i.name}`);

  return problems;
}
