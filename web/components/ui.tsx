import type { FindingConfidence, FindingSource } from "@/lib/types";

export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden>
      <rect width="34" height="34" rx="9" fill="#0E9CA5" />
      <circle cx="11" cy="23" r="3.4" fill="#16303C" />
      <circle cx="23" cy="11" r="3.4" fill="#fff" />
      <path
        d="M11 23 C 11 15, 23 19, 23 11"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 4"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Mark />
      <div>
        <div className="font-display text-[19px] font-bold tracking-tight text-ink">
          SafetyRoutes
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-route-deep">
          Guided check
        </div>
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<FindingSource, string> = {
  website: "WEBSITE",
  server: "SERVER",
  other: "OTHER",
};
const SOURCE_BG: Record<FindingSource, string> = {
  website: "#0E9CA5",
  server: "#2F6F4E",
  other: "#9C6B1C",
};

export function SourceChip({ source }: { source: FindingSource }) {
  return (
    <span
      className="rounded-md px-2.5 py-1.5 font-mono text-[10px] font-bold text-white whitespace-nowrap"
      style={{ background: SOURCE_BG[source] }}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

const PILL: Record<FindingConfidence, { label: string; bg: string; fg: string }> = {
  confirmed: { label: "CONFIRMED", bg: "#F8E7E2", fg: "#C0492E" },
  advisory: { label: "ADVISORY — CHECK", bg: "#FBF1E0", fg: "#A6690F" },
  no_issue: { label: "NO ISSUE", bg: "#E3F1EB", fg: "#1F7A5A" },
};

export function ConfidencePill({ confidence }: { confidence: FindingConfidence }) {
  const p = PILL[confidence];
  return (
    <span
      className="rounded-full px-2.5 py-1.5 font-mono text-[10.5px] font-bold whitespace-nowrap"
      style={{ background: p.bg, color: p.fg }}
    >
      {p.label}
    </span>
  );
}
