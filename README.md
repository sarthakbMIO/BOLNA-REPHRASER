# Bolna Extraction Rephraser

Web UI + MCP connector on Vercel. Claude (in claude.ai) does the rephrasing; no Anthropic API key needed.

## How it works
1. Open the web app → paste Bolna bearer token + agent ID → Load fields.
2. Select fields → pick a preset or write an instruction → Create job. You get a job ID, e.g. K7Q2MX.
3. In claude.ai (connector on), send: "Rephrase Bolna job K7Q2MX".
4. Claude reads the job, rephrases, and submits. The server checks answer values are unchanged, then creates a Google Doc:
   Summary tab + one tab per field (Rephrased → What Changed → Original).
5. The web page shows the doc link automatically.

The Bolna token is used once to fetch fields and is never stored.

## Deploy

1. Push this folder to GitHub, import into Vercel (auto-detects Next.js).
2. Vercel → Storage/Marketplace → add "Upstash for Redis" (free) and connect it.
   This sets KV_REST_API_URL and KV_REST_API_TOKEN.
3. Set MCP_SECRET to a long random string (e.g. `openssl rand -hex 24`).
4. Google access — pick ONE:
   Option 1, your own account (works with My Drive):
     - Google Cloud Console → new project → enable Google Docs API + Google Drive API.
     - OAuth consent screen (Internal) → OAuth client ID (Web application),
       redirect URI https://developers.google.com/oauthplayground
     - OAuth Playground → gear → "Use your own OAuth credentials" → paste client ID/secret.
     - Scopes: https://www.googleapis.com/auth/documents and https://www.googleapis.com/auth/drive
       → Authorize → Exchange for tokens.
     - Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
   Option 2, service account:
     - Paste the whole JSON key as GOOGLE_SERVICE_ACCOUNT_JSON.
     - GOOGLE_DRIVE_FOLDER_ID must be a folder in a Shared Drive where the service account is Content manager
       (service accounts have no storage of their own).
   Optional: GOOGLE_DRIVE_FOLDER_ID, SHARE_WITH_EMAIL.
5. Redeploy. In claude.ai → Settings → Connectors → Add custom connector:
     Name: Bolna Rephraser
     URL:  https://YOUR-APP.vercel.app/api/mcp?key=YOUR_MCP_SECRET
   On Team/Enterprise, an org owner may need to add it first.

## MCP tools
- list_pending_jobs — jobs waiting for rephrasing
- get_job — instruction + rules + selected fields
- submit_rephrased — validates, writes the Google Doc, marks job done.
  Rejects missing/unknown fields, empty prompts or conditions, and any change to answer values or their order.

## Local dev
cp .env.example .env.local, fill values, `npm install`, `npm run dev`.

## Where to change things
- lib/rules.ts — the rephrasing standard sent to Claude
- lib/validate.ts — safety checks
- lib/gdocs.ts — Google Doc layout
- app/page.tsx — UI and presets
