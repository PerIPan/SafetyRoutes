"use client";

import { useEffect, useState } from "react";
import { SourceChip, ConfidencePill } from "./ui";
import { bandOf, BAND_META, BAND_ORDER } from "@/lib/report";
import type { Finding, FindingSource, FindingSeverity } from "@/lib/types";

const SOURCES: { key: FindingSource | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "website", label: "Website" },
  { key: "server", label: "Server packages" },
  { key: "other", label: "Other software" },
];

const SEV: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: "#F8E7E2", fg: "#C0492E", label: "Critical" },
  high: { bg: "#FBEADF", fg: "#A6491F", label: "High" },
  medium: { bg: "#FBF1E0", fg: "#A66A12", label: "Medium" },
  low: { bg: "#EDF1F0", fg: "#5E7480", label: "Low" },
  info: { bg: "#E3F1EB", fg: "#1F7A5A", label: "Info" },
};
function SevBadge({ s }: { s: FindingSeverity | null | undefined }) {
  if (!s) return null;
  const st = SEV[s];
  return (
    <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: st.bg, color: st.fg }}>
      {st.label}
    </span>
  );
}

interface CveData {
  description?: string | null;
  cvssScore?: number | null;
  cvssSeverity?: string | null;
  isKev?: boolean;
  epssScore?: number | null;
  techniques?: { attackId: string; name: string }[];
}

/** Plain-words exploit-likelihood from EPSS (architect: label in words, not bare numbers). */
function epssWord(p?: number | null): string | null {
  if (typeof p !== "number") return null;
  if (p >= 0.5) return "Likely to be targeted";
  if (p >= 0.1) return "Could be targeted";
  return "Low chance of being targeted";
}

function CveDetail({ cveId, finding }: { cveId: string; finding: Finding }) {
  const [d, setD] = useState<CveData | null | undefined>(undefined); // undefined = loading
  useEffect(() => {
    let on = true;
    fetch(`/api/cve/${encodeURIComponent(cveId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => on && setD(j))
      .catch(() => on && setD(null));
    return () => {
      on = false;
    };
  }, [cveId]);

  return (
    <div className="mt-3 border-t border-line pt-3">
      {d === undefined ? (
        <div className="text-[13px] text-muted">Loading details…</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {d?.isKev && (
              <span className="rounded-md bg-[#F8E7E2] px-2 py-1 text-[11px] font-bold text-[#C0492E]">
                ⚑ Actively exploited
              </span>
            )}
            {epssWord(d?.epssScore) && (
              <span className="rounded-md bg-paper px-2 py-1 text-[11px] font-medium text-ink-soft">
                {epssWord(d?.epssScore)}
              </span>
            )}
            {typeof d?.cvssScore === "number" && (
              <span className="rounded-md bg-paper px-2 py-1 font-mono text-[11px] text-muted">
                CVSS {d.cvssScore}
              </span>
            )}
          </div>

          {d?.description && (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{d.description}</p>
          )}

          {d?.techniques && d.techniques.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[12px] font-semibold text-ink">
                How attackers could use this (ATT&amp;CK techniques) — map to your controls:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.techniques.slice(0, 12).map((t) => (
                  <a
                    key={t.attackId}
                    href={`https://mitre-explorer.org/techniques/${t.attackId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] text-route-deep hover:border-route"
                  >
                    {t.attackId} · {t.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
            <a
              href={`https://mitre-explorer.org/cves/${cveId}`}
              target="_blank"
              rel="noreferrer"
              className="text-route-deep underline"
            >
              View {cveId} on MITRE Explorer →
            </a>
            <span className="font-mono text-muted">
              {[finding.module, finding.purl, finding.packageName].filter(Boolean).join("  ·  ")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function FindingCard({
  f,
  open,
  onToggle,
}: {
  f: Finding;
  open: boolean;
  onToggle: () => void;
}) {
  const canOpen = !!f.cveId;
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <button
        type="button"
        onClick={canOpen ? onToggle : undefined}
        className={`flex w-full items-start gap-3.5 text-left ${canOpen ? "cursor-pointer" : "cursor-default"}`}
      >
        <SourceChip source={f.source} />
        <ConfidencePill confidence={f.confidence} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold text-ink">{f.title}</span>
            <SevBadge s={f.severity} />
            {f.isKev && (
              <span className="rounded-md bg-[#F8E7E2] px-2 py-0.5 text-[11px] font-bold text-[#C0492E]">
                ⚑ Actively exploited
              </span>
            )}
          </div>
          {f.plainExplanation && (
            <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">
              {f.plainExplanation}{" "}
              {f.fixText && <span className="font-semibold text-ink">Fix: {f.fixText}</span>}
            </div>
          )}
        </div>
        {canOpen && <span className="mt-1 text-muted">{open ? "▾" : "▸"}</span>}
      </button>
      {open && canOpen && f.cveId && <CveDetail cveId={f.cveId} finding={f} />}
    </div>
  );
}

export function FindingsView({ findings }: { findings: Finding[] }) {
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<FindingSource | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

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
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
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
              {s.label} <span className={active ? "text-white/80" : "text-muted"}>{countFor(s.key)}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-muted">
          No findings match {q ? `“${q}”` : "this filter"}.
        </p>
      ) : (
        <div className="flex flex-col gap-7">
          {BAND_ORDER.map((band) => {
            const group = filtered.filter((f) => bandOf(f) === band);
            if (!group.length) return null;
            const meta = BAND_META[band];
            return (
              <div key={band}>
                <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  <span className="text-[13px] font-bold text-ink">{meta.label}</span>
                  <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
                    {group.length}
                  </span>
                  <span className="text-[12px] text-muted">{meta.blurb}</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {group.map((f) => (
                    <FindingCard
                      key={f.id}
                      f={f}
                      open={openId === f.id}
                      onToggle={() => setOpenId(openId === f.id ? null : (f.id ?? null))}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
