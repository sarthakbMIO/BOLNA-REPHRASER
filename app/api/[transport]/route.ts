import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getJob, listPendingJobs, saveJob } from "@/lib/store";
import { validateRephrased } from "@/lib/validate";
import { createJobDoc } from "@/lib/gdocs";
import { REPHRASE_RULES } from "@/lib/rules";

export const maxDuration = 60;

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_pending_jobs",
      "List Bolna rephrase jobs created in the web UI that are waiting to be rephrased.",
      {},
      async () => {
        const jobs = await listPendingJobs();
        if (!jobs.length) return text("No pending jobs.");
        return text(
          JSON.stringify(
            jobs.map((j) => ({
              job_id: j.id,
              created_at: j.createdAt,
              agent_id: j.agentId,
              fields: j.fields.map((f) => f.name),
              instruction: j.instruction.slice(0, 200),
            })),
            null,
            2
          )
        );
      }
    );

    server.tool(
      "get_job",
      "Get a rephrase job: the instruction, the rephrasing rules, and every selected extraction field with its current prompt and answer options. Rephrase each field, then call submit_rephrased.",
      { job_id: z.string().describe("Job ID shown in the web UI, e.g. K7Q2MX") },
      async ({ job_id }) => {
        const job = await getJob(job_id);
        if (!job) return text(`Job ${job_id} not found or expired.`, true);
        if (job.status === "done") return text(`Job ${job.id} is already done: ${job.docUrl}`);
        return text(
          JSON.stringify(
            {
              job_id: job.id,
              rules: REPHRASE_RULES,
              instruction: job.instruction,
              fields: job.fields.map((f) => ({
                name: f.name,
                category: f.category,
                answer_type: f.is_objective ? "pre-defined" : "free text",
                question: f.question,
                ...(f.is_objective ? { objective_options: f.objective_options } : {}),
              })),
            },
            null,
            2
          )
        );
      }
    );

    server.tool(
      "submit_rephrased",
      "Submit the rephrased fields for a job. The server checks that answer values are unchanged and every field is present, then writes a Google Doc with one tab per field and returns its link. If problems are returned, fix them and submit again.",
      {
        job_id: z.string(),
        fields: z
          .array(
            z.object({
              name: z.string().describe("Field name exactly as given in get_job"),
              question: z.string().describe("Rephrased extraction prompt"),
              objective_options: z
                .array(z.object({ value: z.string(), condition: z.string() }))
                .optional()
                .describe("Pre-defined fields only: same values, same order, rephrased conditions"),
              change_notes: z.string().optional().describe("1-3 sentences on what changed"),
            })
          )
          .min(1),
      },
      async ({ job_id, fields }) => {
        const job = await getJob(job_id);
        if (!job) return text(`Job ${job_id} not found or expired.`, true);
        if (job.status === "done") return text(`Job ${job.id} is already done: ${job.docUrl}`);

        const problems = validateRephrased(job, fields);
        if (problems.length) {
          return text(`Not saved. Fix these and submit again:\n- ${problems.join("\n- ")}`, true);
        }

        try {
          const docUrl = await createJobDoc(job, fields);
          await saveJob({ ...job, status: "done", docUrl, completedAt: new Date().toISOString() });
          return text(`Done. Google Doc created: ${docUrl}`);
        } catch (e: any) {
          await saveJob({ ...job, error: e?.message || "Doc creation failed" });
          return text(`Rephrasing passed checks, but the Google Doc could not be created: ${e?.message}`, true);
        }
      }
    );
  },
  {},
  { basePath: "/api", maxDuration: 60, disableSse: true }
);

/** Connector URL must include ?key=MCP_SECRET */
async function guarded(req: Request) {
  const secret = process.env.MCP_SECRET;
  const key = new URL(req.url).searchParams.get("key");
  if (!secret || key !== secret) return new Response("Unauthorized", { status: 401 });
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
