"use client";

import { useEffect, useState } from "react";
import { Modal, HelpLink } from "@/components/modal";

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
      <HelpLink onClick={() => setShowSetup(true)} />

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
            Install the collector on a server you own and it&apos;ll push a fresh report on a schedule
            — then this step just picks it up. Open <b className="text-ink">How this step works</b> for
            the one-time setup command, or upload a report file now.
          </p>
        </div>
      )}

      {/* Manual fallback */}
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-soft">
        <span className="text-muted">Already have a Trivy report file?</span>
        <input type="file" accept="application/json,.json" onChange={onFile} className="text-[12px]" />
        {manualName && <span className="font-mono text-[12px] text-safe">✓ {manualName} ready</span>}
      </div>

      <Modal
        open={showSetup}
        onClose={() => setShowSetup(false)}
        eyebrow="Server packages · Trivy"
        title="Checking a server you own"
        titleId="server-step-help"
        footer={
          <button
            onClick={() => setShowSetup(false)}
            className="rounded-xl bg-route px-5 py-2.5 text-[14px] font-semibold text-white"
          >
            Got it
          </button>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-soft">
          Your server&apos;s installed packages are checked with <b className="text-ink">Trivy</b>,
          which runs <b className="text-ink">on your own machine</b>. A small collector pushes only the
          resulting vulnerability report to SafetyRoutes —{" "}
          <b className="text-ink">your files and data never leave the server</b>. Set it up once and it
          keeps a fresh report waiting, so this step just picks it up.
        </p>

        <p className="mt-4 text-[13px] font-semibold text-ink">
          One-time setup — run this on a server you own
        </p>
        {status ? (
          <>
            <div className="relative mt-2">
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
              The token is your organization&apos;s — keep it private.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13px] text-muted">Loading your setup command…</p>
        )}

        <p className="mt-4 text-[13px] font-semibold text-ink">Keep it fresh</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
          Put the command on a schedule (cron / Task Scheduler) so a new report is always waiting — see{" "}
          <b className="text-ink">scripts/sr-trivy-collector.sh</b> in the repo for a ready-made script.
        </p>

        <p className="mt-4 text-[13px] font-semibold text-ink">Prefer to do it by hand?</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
          You can also upload a Trivy JSON report directly on this step — no collector needed.
        </p>

        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
          Each vulnerability is enriched via <b className="text-ink">MITRE Explorer</b> — CVSS
          severity, the KEV “known-exploited” flag, and MITRE ATT&amp;CK techniques — and explained in
          plain language on your report.
        </p>
      </Modal>
    </div>
  );
}
