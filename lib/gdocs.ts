import { google } from "googleapis";
import type { Field, Job, Rephrased } from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
];

function getAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON } = process.env;
  if (GOOGLE_REFRESH_TOKEN && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    const o = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    o.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    return o;
  }
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    const c = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.JWT({ email: c.client_email, key: c.private_key, scopes: SCOPES });
  }
  throw new Error("Google is not configured: set GOOGLE_REFRESH_TOKEN (+ client id/secret) or GOOGLE_SERVICE_ACCOUNT_JSON.");
}

type Style = "TITLE" | "HEADING_1" | "HEADING_2" | "HEADING_3" | "NORMAL_TEXT";
type Block = { text: string; style: Style };

const clean = (s: string) =>
  String(s ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();

function fieldBlock(label: string, f: Field, question: string, options: { value: string; condition: string }[]): Block[] {
  const b: Block[] = [{ text: label, style: "HEADING_1" }];
  b.push({ text: "Extraction Prompt", style: "HEADING_2" });
  b.push({ text: clean(question) || "(empty)", style: "NORMAL_TEXT" });
  if (f.is_objective) {
    b.push({ text: "Possible Answers", style: "HEADING_2" });
    for (const o of options) {
      b.push({ text: `Answer Value: ${clean(o.value)}`, style: "HEADING_3" });
      b.push({ text: `Condition: ${clean(o.condition)}`, style: "NORMAL_TEXT" });
    }
  }
  return b;
}

function fieldTab(f: Field, r: Rephrased): Block[] {
  const type = [f.is_objective && "Pre-defined", f.is_subjective && "Free text"].filter(Boolean).join(" + ") || "—";
  return [
    { text: f.name, style: "TITLE" },
    { text: `Category: ${f.category}   |   Answer type: ${type}   |   Model: ${f.model || "—"}`, style: "NORMAL_TEXT" },
    ...fieldBlock("Rephrased", f, r.question, r.objective_options ?? []),
    { text: "What Changed", style: "HEADING_2" },
    { text: clean(r.change_notes || "No notes provided."), style: "NORMAL_TEXT" },
    ...fieldBlock("Original (for reference)", f, f.question, f.objective_options),
  ];
}

function summaryTab(job: Job): Block[] {
  return [
    { text: "Bolna Extraction Rephrase", style: "TITLE" },
    { text: `Job: ${job.id}`, style: "NORMAL_TEXT" },
    { text: `Agent ID: ${job.agentId}`, style: "NORMAL_TEXT" },
    { text: `Created: ${new Date(job.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`, style: "NORMAL_TEXT" },
    { text: "Instruction", style: "HEADING_2" },
    { text: clean(job.instruction), style: "NORMAL_TEXT" },
    { text: "Fields in this doc", style: "HEADING_2" },
    ...job.fields.map((f) => ({
      text: `${f.name}  —  ${f.is_objective ? "Pre-defined" : "Free text"}`,
      style: "NORMAL_TEXT" as Style,
    })),
  ];
}

/** Insert blocks into an empty tab and apply heading styles. */
function tabRequests(tabId: string, blocks: Block[]): any[] {
  const text = blocks.map((b) => b.text + "\n").join("");
  const reqs: any[] = [{ insertText: { location: { index: 1, tabId }, text } }];
  let pos = 1;
  for (const b of blocks) {
    const len = b.text.length + 1;
    if (b.style !== "NORMAL_TEXT") {
      reqs.push({
        updateParagraphStyle: {
          range: { startIndex: pos, endIndex: pos + len, tabId },
          paragraphStyle: { namedStyleType: b.style },
          fields: "namedStyleType",
        },
      });
    }
    pos += len;
  }
  return reqs;
}

export async function createJobDoc(job: Job, rephrased: Rephrased[]): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });
  const byName = new Map(rephrased.map((r) => [r.name, r]));

  const date = new Date().toISOString().slice(0, 10);
  const folder = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const file = await drive.files.create({
    requestBody: {
      name: `Bolna Rephrase — ${job.id} — ${date}`,
      mimeType: "application/vnd.google-apps.document",
      parents: folder ? [folder] : undefined,
    },
    supportsAllDrives: true,
    fields: "id",
  });
  const documentId = file.data.id!;

  // First tab exists already → rename to Summary.
  const doc = await docs.documents.get({ documentId, includeTabsContent: true });
  const summaryId = doc.data.tabs?.[0]?.tabProperties?.tabId;
  if (!summaryId) throw new Error("Could not read the new document's first tab.");

  // Add one tab per field, in order.
  const addRes = await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        { updateDocumentTabProperties: { tabProperties: { tabId: summaryId, title: "Summary" }, fields: "title" } },
        ...job.fields.map((f, i) => ({
          addDocumentTab: { tabProperties: { title: f.name.slice(0, 100), index: i + 1 } },
        })),
      ] as any,
    },
  });
  const replies = addRes.data.replies ?? [];
  const fieldTabIds = job.fields.map((_, i) => (replies[i + 1] as any)?.addDocumentTab?.tabProperties?.tabId as string);
  if (fieldTabIds.some((id) => !id)) throw new Error("Google Docs did not return tab IDs for every field.");

  // Fill all tabs in one batch.
  const requests = [
    ...tabRequests(summaryId, summaryTab(job)),
    ...job.fields.flatMap((f, i) => tabRequests(fieldTabIds[i], fieldTab(f, byName.get(f.name)!))),
  ];
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });

  const shareWith = process.env.SHARE_WITH_EMAIL;
  if (shareWith) {
    await drive.permissions
      .create({
        fileId: documentId,
        supportsAllDrives: true,
        sendNotificationEmail: false,
        requestBody: { type: "user", role: "writer", emailAddress: shareWith },
      })
      .catch(() => undefined); // sharing is a convenience, never a failure
  }

  return `https://docs.google.com/document/d/${documentId}/edit`;
}
