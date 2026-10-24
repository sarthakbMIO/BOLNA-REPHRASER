import { Redis } from "@upstash/redis";
import type { Job } from "./types";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let client: Redis | null = null;
function redis(): Redis {
  if (!url || !token) throw new Error("Redis is not configured (KV_REST_API_URL / KV_REST_API_TOKEN).");
  if (!client) client = new Redis({ url, token });
  return client;
}

const TTL = 60 * 60 * 24 * 7; // 7 days
const PENDING = "jobs:pending";

export function newJobId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function saveJob(job: Job): Promise<void> {
  await redis().set(`job:${job.id}`, job, { ex: TTL });
  if (job.status === "pending") await redis().sadd(PENDING, job.id);
  else await redis().srem(PENDING, job.id);
}

export async function getJob(id: string): Promise<Job | null> {
  return (await redis().get<Job>(`job:${id.trim().toUpperCase()}`)) ?? null;
}

export async function listPendingJobs(): Promise<Job[]> {
  const ids = (await redis().smembers(PENDING)) as string[];
  const jobs: Job[] = [];
  for (const id of ids) {
    const j = await getJob(id);
    if (j && j.status === "pending") jobs.push(j);
    else await redis().srem(PENDING, id); // expired or finished
  }
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
