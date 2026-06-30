"use client";

import { useEffect, useState } from "react";

/** Wizard "Server packages" step. The host-side collector pushes a Trivy report to the inbox on a
 *  schedule, so this step's happy path is "a report is already waiting — we'll include it." It also
 *  shows the one-time setup snippet (token + push command) and keeps a manual file-upload fallback. */
type InboxStatus = {
  token: string;
  endpoint: string;
  waiting: boolean;
  latest: {
    receivedAt: string;
    sourceHost: string | null;
    resultCount: number | null;
    vulnCount: number | null;
    sha256: string;
  } | null;
};

function ago(s: string): { label: string; days: number } {
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return { label: "unknown", days: -1 }; // surface parse failure as stale

  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const days = Math.floor(secs / 86400);
  if (secs < 60) return { label: "just now", days };
  if (secs < 3600) return { label: `${Math.floor(secs / 60)} min ago`, days };
  if (secs < 86400) return { label: `${Math.floor(secs / 3600)} hr ago`, days };
  return { label: `${days} day${days > 1 ? "s" : ""} ago`, days };
}

export function ServerStep({
  onManualReport,
  manualName,
}: {
  onManualReport: (text: string | null, name: string | null) => void;
  manualName: string | null;
}) {
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/inbox/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  const cmd = status
    ? [
        "docker run --rm \\",
        "  -v /:/scanroot:ro \\",
        "  -v sr-trivy-cache:/tmp/trivy-cache -e TRIVY_CACHE_DIR=/tmp/trivy-cache \\",
        "  aquasec/trivy:0.55.2 \\",
        "  fs --scanners vuln --format json --ignore-unfixed /scanroot \\",
        `| curl -sf -H "Authorization: Bearer ${status.token}" \\`,
        '       -H "X-Source-Host: $(hostname)" --data-binary @- \\',
        `       "${status.endpoint}"`,
      ].join("\n")
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      onManualReport(null, null);
      return;
    }
    onManualReport(await file.text(), file.name);
  }

  const waitingReport = status?.waiting ? status.latest : null;
  const rel = waitingReport ? ago(waitingReport.receivedAt) : null;
  const stale = rel ? rel.days > 60 || rel.days < 0 : false;
  const aging = rel ? rel.days > 14 && rel.days <= 60 : false;

  return (
    <div className="space-y-4">
      {/* Waiting-report card — the happy path */}
      {waitingReport && !manualName ? (
        <div
          className={`rounded-xl border-[1.5px] px-5 py-4 ${
            stale
              ? "border-risk/40 bg-[#FDF6F4]"
              : aging
                ? "border-[#E0C089] bg-[#FCF8EF]"
                : "border-route/40 bg-[#F1FAFA]"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[16px]">{stale ? "⚠️" : "✓"}</span>
            <span className="text-[14px] font-semibold text-ink">
              A server report is waiting — received {rel?.label ?? "recently"}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {waitingReport.sourceHost ? (
              <>
                from <b className="text-ink">{waitingReport.sourceHost}</b>,{" "}
              </>
            ) : null}
            {waitingReport.vulnCount ?? 0} package vulnerabilit
            {(waitingReport.vulnCount ?? 0) === 1 ? "y" : "ies"} across{" "}
            {waitingReport.resultCount ?? 0} targets. We&apos;ll include it in this report
            automatically.
            {stale && (
              <>
                {" "}
                <b className="text-risk">This report is over 60 days old</b> — re-run the collector
                on your server for fresh results.
              </>
            )}
            {aging && <> It&apos;s a little old — consider re-running the collector soon.</>}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border-[1.5px] border-dashed border-line bg-[#FAFDFC] px-5 py-4">
          <div className="text-[14px] font-semibold text-ink">No server report waiting yet</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            Install the collector on a server you own (below) and it&apos;ll push a fresh report on a
            schedule — then this step just picks it up. Or upload a report file now.
          </p>
        </div>
      )}

      {/* One-time setup (collapsible) */}
      <div className="rounded-xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => setShowSetup((s) => !s)}
          className="flex w-full items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-[13.5px] font-semibold text-ink">
            {showSetup ? "▾" : "▸"} Connect your server (one-time setup)
          </span>
          <span className="font-mono text-[11px] text-muted">push to SafetyRoutes</span>
        </button>
        {showSetup &&
          (status ? (
            <div className="border-t border-line px-5 py-4">
              <p className="mb-2 max-w-[64ch] text-[13px] leading-relaxed text-ink-soft">
              Run this on a server you own to push a report now. To keep it always-fresh, put it on a
              schedule (cron / Task Scheduler) — see <b>scripts/sr-trivy-collector.sh</b> in the repo.
              The token below is your organization&apos;s — keep it private.
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-xl border border-[#21424C] bg-[#10262F] px-4 py-3.5 pr-16 font-mono text-[11.5px] leading-relaxed text-[#CDE7E6]">
                {cmd}
              </pre>
              <button
                type="button"
                onClick={copy}
                className="absolute right-2 top-2 rounded-md bg-[#21424C] px-2.5 py-1 font-mono text-[11px] text-[#CDE7E6] hover:bg-[#2C5A68]"
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            </div>
              <p className="mt-2 font-mono text-[11px] text-muted">
                Execution stays on your host — SafetyRoutes only receives the JSON report.
              </p>
            </div>
          ) : (
            <p className="border-t border-line px-5 py-4 text-[13px] text-muted">Loading…</p>
          ))}
      </div>

      {/* Manual fallback */}
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-soft">
        <span className="text-muted">Already have a Trivy report file?</span>
        <input type="file" accept="application/json,.json" onChange={onFile} className="text-[12px]" />
        {manualName && <span className="font-mono text-[12px] text-safe">✓ {manualName} ready</span>}
      </div>
    </div>
  );
}
