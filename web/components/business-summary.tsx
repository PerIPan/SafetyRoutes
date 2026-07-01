"use client";

import { useEffect, useState } from "react";
import type { BusinessReport } from "@/lib/types";

export function BusinessSummary({ scanId, initial }: { scanId: string; initial: BusinessReport | null }) {
  const [report, setReport] = useState(initial);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (report) return;
    fetch(`/api/scans/${scanId}/business-report`, { method: "POST" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("report failed")))
      .then((body) => setReport(body.report))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [report, scanId]);

  return (
    <section className="mb-7 rounded-2xl border border-[#C2E1DF] bg-[#F7FCFB] p-5">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-route-deep">
        Executive summary
      </div>
      {loading && <p className="text-[14px] text-muted">Writing a business-friendly summary…</p>}
      {!loading && !report && <p className="text-[14px] text-muted">A summary could not be generated.</p>}
      {report && <>
        <h2 className="font-display text-[22px] font-semibold text-ink">{report.headline}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{report.overview}</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[14px] text-ink-soft">
          {report.actions.map((action, i) => <li key={i}>{action}</li>)}
        </ol>
        <p className="mt-3 text-[13px] text-safe">{report.positive}</p>
        <p className="mt-3 font-mono text-[10px] text-muted">
          {report.generatedBy === "ollama" ? "Drafted locally with Ollama" : "Generated from report rules"}
          {" · "}Review before external distribution
        </p>
      </>}
    </section>
  );
}
