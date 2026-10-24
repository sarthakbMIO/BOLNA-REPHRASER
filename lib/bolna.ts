import type { Field } from "./types";

const BOLNA_BASE = "https://api.bolna.ai";

/** Fetch every extraction field on an agent. The token is used once and never stored. */
export async function fetchAgentFields(token: string, agentId: string): Promise<Field[]> {
  const res = await fetch(
    `${BOLNA_BASE}/agent/${encodeURIComponent(agentId)}/extraction-categories`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bolna returned ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const data = await res.json();
  const fields: Field[] = [];
  for (const cat of data?.categories ?? []) {
    for (const d of cat?.dispositions ?? []) {
      fields.push({
        id: String(d.id),
        name: String(d.name ?? "untitled"),
        category: String(d.category ?? cat.name ?? "General"),
        model: String(d.model ?? cat.model ?? ""),
        is_objective: Boolean(d.is_objective),
        is_subjective: Boolean(d.is_subjective),
        subjective_type: d.subjective_type ?? null,
        question: String(d.question ?? ""),
        objective_options: (d.objective_options ?? []).map((o: any) => ({
          value: String(o.value ?? ""),
          condition: String(o.condition ?? ""),
        })),
      });
    }
  }
  return fields;
}
