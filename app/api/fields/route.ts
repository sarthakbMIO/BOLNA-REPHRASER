import { NextResponse } from "next/server";
import { fetchAgentFields } from "@/lib/bolna";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { token, agentId } = await req.json();
    if (!token || !agentId) return NextResponse.json({ error: "Bearer token and agent ID are required." }, { status: 400 });
    const fields = await fetchAgentFields(String(token).trim(), String(agentId).trim());
    return NextResponse.json({ fields });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load fields." }, { status: 502 });
  }
}
