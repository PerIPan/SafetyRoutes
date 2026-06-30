"use client";

import { useEffect, useRef, useState } from "react";
import type { FindingSource, SourceStatus } from "@/lib/types";

const isRunning = (s: Partial<Record<string, SourceStatus>>) =>
  Object.values(s).some((v) => v && (v.status === "running" || v.status === "pending"));

/** Report action bar: share (PDF / copy link) + "Run another check" (disabled while a scan
 *  is still in progress). Polls scan status so the button enables once everything finishes. */
export function ReportActions({
  scanId,
  initial,
}: {
  scanId: string;
  initial: Partial<Record<FindingSource, SourceStatus>>;
}) {
  const [status, setStatus] = useState(initial);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning(status)) return;
    timer.current = setInterval(async () => {
      const r = await fetch(`/api/scans/${scanId}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
      if (!r) return;
      const ss = (r.sourceStatus ?? {}) as Partial<Record<FindingSource, SourceStatus>>;
      setStatus(ss);
      if (!isRunning(ss) && timer.current) clearInterval(timer.current);
    }, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const running = isRunning(status);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
      <button
        onClick={() => window.print()}
        className="rounded-xl bg-route px-5 py-3 text-[14.5px] font-semibold text-white"
      >
        Save / print as PDF
      </button>
      <button
        onClick={copyLink}
        className="rounded-xl border-[1.5px] border-line bg-surface px-5 py-3 text-[14.5px] font-semibold text-ink-soft"
      >
        {copied ? "Link copied ✓" : "Copy share link"}
      </button>
      <div className="flex-1" />
      <button
        disabled={running}
        onClick={() => {
          if (!running) window.location.href = "/new";
        }}
        title={running ? "Wait for the current check to finish" : undefined}
        className="rounded-xl border-[1.5px] border-line bg-surface px-5 py-3 text-[14.5px] font-semibold text-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? "Check in progress…" : "Run another check"}
      </button>
    </div>
  );
}
