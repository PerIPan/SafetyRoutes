import type { FindingSeverity } from './types';

/** Plain-English severity label for a non-technical reader (no CVSS jargon). */
export function plainSeverity(sev: FindingSeverity | null | undefined): string {
  switch (sev) {
    case 'critical': return 'Critical — fix as soon as you can';
    case 'high': return 'High — important to fix soon';
    case 'medium': return 'Medium — worth fixing';
    case 'low': return 'Low — minor';
    default: return 'Informational';
  }
}

/** Map a CVSS severity string (from mitre-explorer) to our enum. */
export function severityFromCvss(s: string | null | undefined): FindingSeverity | null {
  switch (String(s).toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MEDIUM': case 'MODERATE': return 'medium';
    case 'LOW': return 'low';
    case 'NONE': case 'INFO': return 'info';
    default: return null;
  }
}
