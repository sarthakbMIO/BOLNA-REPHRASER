"use client";

import { useEffect, useMemo, useState } from "react";
import type { Field } from "@/lib/types";

const PRESETS: Record<string, (inst: string) => string> = {
  "Adapt for new institution": (inst) =>
    `Adapt every field for ${inst || "[INSTITUTION NAME]"}. Replace the previous institution's name, campuses and programme references. Keep all logic, defaults and multilingual handling unchanged.`,
  "Simplify language": () =>
    "Simplify the wording of every prompt and condition: shorter sentences, plain language, no repetition. Keep every rule and default exactly as it is.",
  "Strengthen edge cases": () =>
    "Tighten edge-case handling: clearer tie-breakers, explicit handling of silence, partial answers and mind changes, and conditions that are strictly mutually exclusive.",
  "Make concise": () =>
    "Make every prompt significantly shorter. Remove redundant examples and repeated rules, but keep every distinct rule, override and default.",
};

type Status = { status: "pending" | "done" | "error"; docUrl: string | null; error: string | null };

export default function Home() {
  const [token, setToken] = useState("");
  const [agentId, setAgentId] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [preset, setPreset] = useState("");
  const [inst, setInst] = useState("");
  const [instruction, setInstruction] = useState("");

  const [jobId, setJobId] = useState("");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [copied, setCopied] = useState(false);

  const chosen = useMemo(() => fields.filter((f) => selected.has(f.id)), [fields, selected]);
  const command = jobId ? `Rephrase Bolna job ${jobId}` : "";

  async function loadFields() {
    setErr(""); setLoading(true); setFields([]); setSelected(new Set()); setJobId(""); setStatus(null);
    try {
      const r = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, agentId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.fields.length) throw new Error("This agent has no extraction fields.");
      setFields(d.fields);
    } catch (e: any) {
      setErr(e.message || "Could not load fields.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function pickPreset(name: string) {
    setPreset(name);
    setInstruction(PRESETS[name](inst));
  }

  useEffect(() => {
    if (preset === "Adapt for new institution") setInstruction(PRESETS[preset](inst));
  }, [inst, preset]);

  async function createJob() {
    setErr(""); setCreating(true); setStatus(null);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, instruction, fields: chosen }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setJobId(d.id);
      setStatus({ status: "pending", docUrl: null, error: null });
    } catch (e: any) {
      setErr(e.message || "Could not create job.");
    } finally {
      setCreating(false);
    }
  }

  // Poll until Claude finishes the job.
  useEffect(() => {
    if (!jobId || status?.status === "done") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (r.ok) setStatus(await r.json());
      } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [jobId, status?.status]);

  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const step2 = fields.length > 0;
  const step3 = step2 && selected.size > 0;

  return (
    <main className="wrap">
      <h1>Bolna Extraction Rephraser</h1>
      <p className="sub">Load an agent&apos;s extraction fields, pick the ones to rephrase, and get a Google Doc with one tab per field.</p>

      {/* 1 */}
      <section className="card">
        <div className="head"><span className={`num ${step2 ? "done" : ""}`}>1</span><span className="title">Connect to agent</span></div>
        <div className="grid">
          <div>
            <label>Bolna bearer token</label>
            <input type="password" className="mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder="sa-…" />
          </div>
          <div>
            <label>Agent ID</label>
            <input className="mono" value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="uuid" />
          </div>
          <button className="btn p" onClick={loadFields} disabled={loading || !token || !agentId}>
            {loading ? "Loading…" : "Load fields"}
          </button>
        </div>
        {step2 && <div className="alert ok">Loaded {fields.length} field{fields.length === 1 ? "" : "s"}.</div>}
        {err && !step2 && <div className="alert err">{err}</div>}
      </section>

      {/* 2 */}
      <section className={`card ${step2 ? "" : "off"}`}>
        <div className="head"><span className={`num ${step3 ? "done" : ""}`}>2</span><span className="title">Select fields</span></div>
        <div className="bar">
          <button className="btn g" onClick={() => setSelected(new Set(fields.map((f) => f.id)))}>Select all</button>
          <button className="btn g" onClick={() => setSelected(new Set())}>Clear</button>
          <span className="muted">{selected.size} selected</span>
        </div>
        {fields.map((f) => (
          <div key={f.id} className={`field ${selected.has(f.id) ? "sel" : ""}`} onClick={() => toggle(f.id)}>
            <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} onClick={(e) => e.stopPropagation()} />
            <div style={{ minWidth: 0 }}>
              <div className="fname">{f.name}</div>
              <div className="badges">
                <span className="badge">{f.category}</span>
                {f.is_objective && <span className="badge">Pre-defined · {f.objective_options.map((o) => o.value).join(" / ")}</span>}
                {f.is_subjective && <span className="badge">Free text</span>}
                {f.model && <span className="badge">{f.model}</span>}
              </div>
              <div className="preview">{f.question}</div>
            </div>
          </div>
        ))}
      </section>

      {/* 3 */}
      <section className={`card ${step3 ? "" : "off"}`}>
        <div className="head"><span className={`num ${jobId ? "done" : ""}`}>3</span><span className="title">Rephrase instruction</span></div>
        <div className="chips">
          {Object.keys(PRESETS).map((p) => (
            <span key={p} className={`chip ${preset === p ? "on" : ""}`} onClick={() => pickPreset(p)}>{p}</span>
          ))}
        </div>
        {preset === "Adapt for new institution" && (
          <div className="mb">
            <label>New institution (name, campus, programmes if you want them included)</label>
            <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="e.g. IIBS Bangalore — PGDM PRIME, PGDM NEXTGEN, MBA PRIME" />
          </div>
        )}
        <div className="mb">
          <label>Instruction</label>
          <textarea value={instruction} onChange={(e) => { setInstruction(e.target.value); setPreset(""); }} placeholder="Describe how the extraction logic should be rephrased…" />
        </div>
        <button className="btn p" onClick={createJob} disabled={creating || !instruction.trim() || selected.size === 0}>
          {creating ? "Creating…" : `Create job for ${selected.size} field${selected.size === 1 ? "" : "s"}`}
        </button>
        {err && step2 && <div className="alert err">{err}</div>}
      </section>

      {/* 4 */}
      {jobId && (
        <section className="card">
          <div className="head"><span className={`num ${status?.status === "done" ? "done" : ""}`}>4</span><span className="title">Rephrase in Claude</span></div>
          <div className="muted">Job ID</div>
          <div className="jobid">{jobId}</div>
          {status?.status !== "done" && (
            <>
              <p style={{ marginTop: 12, color: "var(--text-2)" }}>
                Open claude.ai with the Bolna Rephraser connector turned on, and send:
              </p>
              <div className="cmd">
                <code>{command}</code>
                <button className="btn o" onClick={copyCommand}>{copied ? "Copied" : "Copy"}</button>
              </div>
              <div className="alert info">Waiting for Claude… this page updates by itself when the doc is ready.</div>
            </>
          )}
          {status?.error && status.status !== "done" && <div className="alert warn">{status.error}</div>}
          {status?.status === "done" && status.docUrl && (
            <div className="alert ok">
              Done. <a href={status.docUrl} target="_blank" rel="noreferrer">Open the Google Doc →</a>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
