"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FindingSource, SourceStatus } from "@/lib/types";

const LABEL: Record<string, string> = {
  website: "Website",
  server: "Server packages",
  other: "Other software",
};

function statusText(v: SourceStatus): string {
  switch (v.status) {
    case "running":
    case "pending":
      return "scanning…";
    case "done":
      return typeof v.count === "number" ? `${v.count} finding(s)` : "done";
    case "skipped":
      return "skipped";
    case "timed_out":
      return "timed out";
    case "failed":
      return "failed";
    default:
      return v.status;
  }
}

const isRunning = (s: Partial<Record<string, SourceStatus>>) =>
  Object.values(s).some((v) => v && (v.status === "running" || v.status === "pending"));

/** Polls scan status while a source (e.g. the async Artemis website scan) is in progress,
 *  shows per-source banners, and refreshes the server-rendered report once everything is done. */
export function ScanLive({
  scanId,
  initial,
}: {
  scanId: string;
  initial: Partial<Record<FindingSource, SourceStatus>>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
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
      if (!isRunning(ss)) {
        if (timer.current) clearInterval(timer.current);
        router.refresh(); // re-render the server report with the new findings
      }
    }, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const entries = Object.entries(status) as [FindingSource, SourceStatus][];
  if (!entries.length) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {entries.map(([src, v]) => {
        const dot =
          v.status === "running" || v.status === "pending"
            ? "animate-pulse bg-route"
            : v.status === "done"
              ? "bg-safe"
              : v.status === "skipped"
                ? "bg-muted"
                : "bg-risk";
        return (
          <span
            key={src}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px]"
          >
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            <b className="text-ink">{LABEL[src] ?? src}</b>
            <span className="text-muted">{statusText(v)}</span>
          </span>
        );
      })}
      {isRunning(status) && (
        <span className="text-[12px] text-muted">· refreshing automatically…</span>
      )}
    </div>
  );
}
