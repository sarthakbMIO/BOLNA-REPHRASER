import { NextResponse } from "next/server";
import { newJobId, saveJob } from "@/lib/store";
import type { Field, Job } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { agentId, instruction, fields } = (await req.json()) as {
      agentId: string;
      instruction: string;
      fields: Field[];
    };
    if (!agentId || !instruction?.trim() || !Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ error: "Agent ID, instruction and at least one field are required." }, { status: 400 });
    }
    const job: Job = {
      id: newJobId(),
      createdAt: new Date().toISOString(),
      agentId: String(agentId).trim(),
      instruction: instruction.trim(),
      fields,
      status: "pending",
    };
    await saveJob(job);
    return NextResponse.json({ id: job.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not create job." }, { status: 500 });
  }
}
