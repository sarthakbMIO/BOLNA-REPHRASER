import { NextResponse } from "next/server";
import { getJob } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found or expired." }, { status: 404 });
  return NextResponse.json({ id: job.id, status: job.status, docUrl: job.docUrl ?? null, error: job.error ?? null });
}
