"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Integrated Trivy ingest for the report page: a copy-paste one-liner that runs Trivy in Docker
 *  on the user's own server and POSTs the result straight to our ingest endpoint (no manual file
 *  picking), plus a file-upload fallback. Execution stays on the user's host — we only receive the
 *  JSON report (the trust boundary the architecture review called out). */
export function ServerCheck({
  scanId,
  token,
  hasServerFindings,
  origin,
}: {
  scanId: string;
  token: string | null;
  hasServerFindings: boolean;
  origin: string; // canonical origin from the server — avoids a localhost flash before hydration
}) {
  const router = useRouter();
  const [winOrigin, setWinOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // fall back to the browser origin only if the server didn't supply one
  useEffect(() => {
    if (!origin) setWinOrigin(window.location.origin);
  }, [origin]);

  const base = origin || winOrigin || "http://localhost:3000";
  const q = token ? `?token=${token}` : "";
  const endpoint = `${base}/api/scans/${scanId}/trivy-upload${q}`;
  const cmd = [
    "docker run --rm \\",
    "  -v /:/scanroot:ro \\",
    "  -v sr-trivy-cache:/tmp/trivy-cache -e TRIVY_CACHE_DIR=/tmp/trivy-cache \\",
    "  aquasec/trivy:0.55.2 \\",
    "  fs --scanners vuln --format json --ignore-unfixed /scanroot \\",
    `| curl -sS -X POST "${endpoint}" --data-binary @- --fail-with-body`,
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = await file.text();
      const r = await fetch(
        `/api/scans/${scanId}/trivy-upload?filename=${encodeURIComponent(file.name)}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: text },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Upload failed");
      setMsg(`Imported ${j.count ?? 0} finding(s).`);
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5 print:hidden">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-route-deep">
        Server packages · Trivy
      </div>
      <h2 className="mt-1 font-display text-[20px] font-semibold text-ink">
        {hasServerFindings ? "Re-check a server" : "Check a server (optional)"}
      </h2>
      <p className="mt-1 max-w-[64ch] text-[13.5px] leading-relaxed text-ink-soft">
        Run this on a server you own. It lists the software installed there and sends only the
        vulnerability report back to SafetyRoutes — your files and data never leave the machine.
        Needs Docker.
      </p>

      <div className="relative mt-3">
        <pre className="overflow-x-auto rounded-xl border border-[#21424C] bg-[#10262F] px-4 py-3.5 pr-16 font-mono text-[12px] leading-relaxed text-[#CDE7E6]">
          {cmd}
        </pre>
        <button
          onClick={copy}
          className="absolute right-2 top-2 rounded-md bg-[#21424C] px-2.5 py-1 font-mono text-[11px] text-[#CDE7E6] hover:bg-[#2C5A68]"
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>

      {token && (
        <p className="mt-2 text-[12px] text-muted">
          The token in the link is unique to this scan — don’t share this command outside your team.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-ink-soft">
        <span className="text-muted">Already have a Trivy report file?</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          disabled={busy}
          className="text-[12px]"
        />
        {busy && <span className="text-muted">importing…</span>}
        {msg && <span className="font-medium text-route-deep">{msg}</span>}
      </div>
    </section>
  );
}
