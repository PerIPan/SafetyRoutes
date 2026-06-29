// Parse a Trivy JSON report (`trivy fs --scanners vuln --format json`). The uploaded file is
// UNTRUSTED — validate the shape, cap the result count, dedupe, and count what we skip.
import { parsePurl, ecosystemFor } from './purl';
import type { FindingSeverity } from './types';

export interface TrivyFinding {
  vulnerabilityId: string;
  pkgName: string;
  purl: string | null;
  ecosystem: string | null;
  installedVersion: string | null;
  fixedVersion: string | null;
  severity: FindingSeverity | null;
  title: string | null;
  primaryUrl: string | null;
  target: string | null;
}

export interface TrivyParseResult {
  findings: TrivyFinding[];
  parsedCount: number;
  skippedCount: number;
}

export const MAX_TRIVY_FINDINGS = 2000;

function mapSeverity(s: unknown): FindingSeverity | null {
  switch (String(s).toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    case 'LOW': return 'low';
    case 'UNKNOWN': case 'NEGLIGIBLE': return 'info';
    default: return null;
  }
}

/** Returns false if the object isn't recognizably a Trivy report (so callers can 400). */
export function looksLikeTrivy(json: unknown): json is { Results?: unknown[] } {
  return !!json && typeof json === 'object' && Array.isArray((json as { Results?: unknown }).Results);
}

export function parseTrivyReport(json: unknown): TrivyParseResult {
  if (!looksLikeTrivy(json)) {
    throw new Error('This does not look like a Trivy JSON report (missing Results[]).');
  }
  const findings: TrivyFinding[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const result of json.Results ?? []) {
    if (!result || typeof result !== 'object') { skipped++; continue; }
    const r = result as Record<string, unknown>;
    const target = typeof r.Target === 'string' ? r.Target : null;
    const vulns = Array.isArray(r.Vulnerabilities) ? r.Vulnerabilities : [];
    for (const v of vulns) {
      if (findings.length >= MAX_TRIVY_FINDINGS) { skipped++; continue; }
      if (!v || typeof v !== 'object') { skipped++; continue; }
      const vuln = v as Record<string, unknown>;
      const id = typeof vuln.VulnerabilityID === 'string' ? vuln.VulnerabilityID : null;
      const pkgName = typeof vuln.PkgName === 'string' ? vuln.PkgName : null;
      if (!id || !pkgName) { skipped++; continue; }

      const purlRaw =
        vuln.PkgIdentifier && typeof vuln.PkgIdentifier === 'object'
          ? (vuln.PkgIdentifier as Record<string, unknown>).PURL
          : null;
      const purl = typeof purlRaw === 'string' ? purlRaw : null;
      const parsed = purl ? parsePurl(purl) : null;

      const key = `${id}|${purl ?? pkgName}`;
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);

      findings.push({
        vulnerabilityId: id,
        pkgName,
        purl,
        ecosystem: parsed ? ecosystemFor(parsed) : null,
        installedVersion: typeof vuln.InstalledVersion === 'string' ? vuln.InstalledVersion : null,
        fixedVersion: typeof vuln.FixedVersion === 'string' ? vuln.FixedVersion : null,
        severity: mapSeverity(vuln.Severity),
        title: typeof vuln.Title === 'string' ? vuln.Title : null,
        primaryUrl: typeof vuln.PrimaryURL === 'string' ? vuln.PrimaryURL : null,
        target,
      });
    }
  }
  return { findings, parsedCount: findings.length, skippedCount: skipped };
}
