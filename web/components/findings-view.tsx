"use client";

import { useState } from "react";
import { SourceChip, ConfidencePill } from "./ui";
import type { Finding, FindingSource } from "@/lib/types";

const SOURCES: { key: FindingSource | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "website", label: "Website" },
  { key: "server", label: "Server packages" },
  { key: "other", label: "Other software" },
];

function FindingCard({ f }: { f: Finding }) {
  return (
    <div className="flex items-start gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <SourceChip source={f.source} />
      <ConfidencePill confidence={f.confidence} />
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold text-ink">{f.title}</div>
        {f.plainExplanation && (
          <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {f.plainExplanation}{" "}
            {f.fixText && <span className="font-semibold text-ink">Fix: {f.fixText}</span>}
          </div>
        )}
        <div className="mt-1.5 font-mono text-[10.5px] text-muted">
          {[
            f.severityPlain,
            f.cveId,
            f.module,
            f.purl,
            f.enrichmentStatus === "unavailable" ? "enrichment: n/a" : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </div>
      </div>
    </div>
  );
}

export function FindingsView({ findings }: { findings: Finding[] }) {
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<FindingSource | "all">("all");

  const ql = q.trim().toLowerCase();
  const filtered = findings.filter((f) => {
    if (src !== "all" && f.source !== src) return false;
    if (!ql) return true;
    return [f.title, f.plainExplanation, f.fixText, f.cveId, f.purl, f.packageName, f.module].some(
      (v) => v && v.toLowerCase().includes(ql),
    );
  });
  const countFor = (k: FindingSource | "all") =>
    k === "all" ? findings.length : findings.filter((f) => f.source === k).length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter findings…"
          className="w-[240px] rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-route"
        />
        <div className="flex-1" />
        {SOURCES.map((s) => {
          const active = src === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSrc(s.key)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${
                active
                  ? "border-route bg-route text-white"
                  : "border-line bg-surface text-ink-soft hover:border-route/50"
              }`}
            >
              {s.label}{" "}
              <span className={active ? "text-white/80" : "text-muted"}>{countFor(s.key)}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-muted">
          No findings match {q ? `“${q}”` : "this filter"}.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((f) => (
            <FindingCard key={f.id} f={f} />
          ))}
        </div>
      )}
    </>
  );
}
