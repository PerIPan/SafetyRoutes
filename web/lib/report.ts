import type { Finding, FindingSource } from './types';

export interface ReportView {
  summary: { confirmed: number; advisory: number; noIssue: number; total: number };
  bySource: Record<FindingSource, Finding[]>;
  findings: Finding[];
}

export function buildReport(findings: Finding[]): ReportView {
  const summary = { confirmed: 0, advisory: 0, noIssue: 0, total: findings.length };
  const bySource: Record<FindingSource, Finding[]> = { website: [], server: [], other: [] };
  for (const f of findings) {
    if (f.confidence === 'confirmed') summary.confirmed++;
    else if (f.confidence === 'advisory') summary.advisory++;
    else summary.noIssue++;
    bySource[f.source].push(f);
  }
  return { summary, bySource, findings };
}
