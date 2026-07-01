import type { Finding, FindingSource } from './types';
import { SEVERITY_ORDER } from './types';

export type PriorityBand = 'fix_now' | 'plan' | 'check' | 'clear';

export interface ReportView {
  summary: {
    confirmed: number;
    advisory: number;
    noIssue: number;
    total: number;
    kevCount: number; // actively-exploited (CISA KEV) findings — drives the top banner
  };
  bySource: Record<FindingSource, Finding[]>;
  findings: Finding[];
}

/** Classify a finding into a plain-language action band (KEV/severity-aware). */
export function bandOf(f: Finding): PriorityBand {
  if (f.confidence === 'no_issue') return 'clear';
  if (f.confidence === 'advisory') return 'check';
  // confirmed: actively-exploited or high-impact jumps to the top.
  if (f.isKev || f.severity === 'critical' || f.severity === 'high') return 'fix_now';
  return 'plan';
}

export const BAND_ORDER: PriorityBand[] = ['fix_now', 'plan', 'check', 'clear'];

export const BAND_META: Record<PriorityBand, { label: string; blurb: string; color: string }> = {
  fix_now: {
    label: 'Fix now',
    blurb: 'Confirmed and high-impact — or being exploited right now.',
    color: '#C0492E',
  },
  plan: {
    label: 'Plan to fix',
    blurb: 'Confirmed, but lower urgency.',
    color: '#A6690F',
  },
  check: {
    label: 'Needs a quick check',
    blurb: 'Worth verifying — we could not scan these directly.',
    color: '#A6690F',
  },
  clear: {
    label: 'All clear',
    blurb: 'Checked, nothing to do.',
    color: '#1F7A5A',
  },
};

export function buildReport(findings: Finding[]): ReportView {
  const summary = { confirmed: 0, advisory: 0, noIssue: 0, total: findings.length, kevCount: 0 };
  const bySource: Record<FindingSource, Finding[]> = { website: [], server: [], other: [] };
  for (const f of findings) {
    if (f.confidence === 'confirmed') summary.confirmed++;
    else if (f.confidence === 'advisory') summary.advisory++;
    else summary.noIssue++;
    if (f.isKev) summary.kevCount++;
    bySource[f.source].push(f);
  }
  return { summary, bySource, findings };
}

// --- Deterministic selection for the business-impact summary ----------------
// Ranks findings the same way the report renders them, guarantees each source a
// small floor so a noisy source (e.g. hundreds of Trivy CVEs) can't bury another
// source's findings, and bounds the set the LLM sees. Pure — no I/O, no LLM.

export interface SelectedFindings {
  selected: Finding[];
  omittedCount: number; // lower-priority items left out (duplicates are not counted)
}

const REPORT_LIMIT = 20;
const PER_SOURCE_FLOOR = 2;
const ALL_SOURCES: FindingSource[] = ['website', 'server', 'other'];

/** Global rank: band → actively-exploited → severity → CVSS → EPSS (all ascending "better first"). */
function rankKey(f: Finding): number[] {
  return [
    BAND_ORDER.indexOf(bandOf(f)),
    f.isKev ? 0 : 1,
    f.severity ? SEVERITY_ORDER[f.severity] : SEVERITY_ORDER.info + 1,
    -(f.cvss ?? 0),
    -(f.epss ?? 0),
  ];
}

function compareFindings(a: Finding, b: Finding): number {
  const ka = rankKey(a);
  const kb = rankKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

export function selectForReport(findings: Finding[], limit = REPORT_LIMIT): SelectedFindings {
  // 1. dedupe — prefer the stable idempotency key, else a content key (defensive:
  //    write-side ON CONFLICT already dedupes, so this rarely fires at read time).
  const seen = new Set<string>();
  const deduped: Finding[] = [];
  for (const f of findings) {
    const key = f.idempotencyKey || `${f.source}|${f.title}|${f.cveId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  // 2. rank globally.
  const ranked = [...deduped].sort(compareFindings);
  const target = Math.min(limit, ranked.length);

  // 3. reserve a per-source floor from the top of each present source, then fill
  //    the remaining slots by global rank.
  const chosen = new Set<Finding>();
  for (const source of ALL_SOURCES) {
    let taken = 0;
    for (const f of ranked) {
      if (chosen.size >= target || taken >= PER_SOURCE_FLOOR) break;
      if (f.source !== source || chosen.has(f)) continue;
      chosen.add(f);
      taken += 1;
    }
  }
  for (const f of ranked) {
    if (chosen.size >= target) break;
    chosen.add(f);
  }

  // 4. emit in global-rank order.
  const selected = ranked.filter((f) => chosen.has(f));
  return { selected, omittedCount: ranked.length - selected.length };
}
