import type { Finding, FindingSource } from './types';

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
