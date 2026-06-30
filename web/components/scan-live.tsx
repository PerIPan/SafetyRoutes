"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FindingSource, SourceStatus } from "@/lib/types";

const LABEL: Record<string, string> = {
  website: "Website",
  server: "Server packages",
  other: "Other software",
};

// Friendly phrasing for the big "in progress" banner ("Scanning your website…").
const RUNNING_LABEL: Record<string, string> = {
  website: "website",
  server: "server packages",
  other: "other software",
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

  const running = entries.filter(([, v]) => v.status === "running" || v.status === "pending");
  const settled = entries.filter(([, v]) => v.status !== "running" && v.status !== "pending");

  return (
    <div className="mb-6 flex flex-col gap-3">
      {/* In progress: a big, obviously-animated banner so it's unmistakable a check is running. */}
      {running.map(([src, v]) => (
        <div
          key={src}
          role="status"
          aria-live="polite"
          className="flex items-center gap-4 rounded-2xl border border-[#C2E1DF] bg-[#E2F1F0] px-5 py-4"
        >
          {/* moving circle (spinning ring + soft pulsing core) */}
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-[3px] border-route/25 border-t-route animate-spin motion-reduce:animate-none" />
            <span className="h-2.5 w-2.5 rounded-full bg-route animate-pulse motion-reduce:animate-none" />
          </span>
          <div className="leading-tight">
            <div className="text-[16px] font-semibold text-route-deep">
              Scanning your {RUNNING_LABEL[src] ?? src}…
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              This usually takes a few minutes — results appear here automatically, no need to refresh.
            </div>
          </div>
        </div>
      ))}

      {/* Finished / skipped sources stay as compact status pills. */}
      {settled.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {settled.map(([src, v]) => {
            const dot =
              v.status === "done" ? "bg-safe" : v.status === "skipped" ? "bg-muted" : "bg-risk";
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
        </div>
      )}
    </div>
  );
}
