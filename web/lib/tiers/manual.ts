// Manual ("Other software") tier: declared product+version → mitre Applications → Advisory.
// Nothing is scanned, so every finding here is Advisory, never Confirmed. Version matching is
// done on our side (isVersionAffected); unknown/undetermined still surfaces as Advisory.
import { resolveApp, getCveDetail } from '../mitre';
import { isVersionAffected } from '../version';
import { plainSeverity, severityFromCvss } from '../severity';
import { idemKey, replaceSourceFindings } from '../findings';
import { setSourceStatus } from '../scans';
import type { Finding } from '../types';

const MAX_CVES_PER_PRODUCT = 8; // cap outbound calls; top CVEs by the API's own ordering

export interface DeclaredItem {
  id?: string | null;
  vendor?: string | null;
  product: string;
  version: string;
}

export async function runManualTier(
  scanId: string,
  items: DeclaredItem[],
): Promise<{ count: number }> {
  const out: Finding[] = [];

  for (const item of items) {
    const app = await resolveApp(item.product || `${item.vendor ?? ''} ${item.product}`.trim());

    if (!app) {
      out.push({
        scanId, source: 'other', confidence: 'advisory',
        title: `${item.product} ${item.version} — couldn't match it to the CVE database`,
        plainExplanation:
          'We could not identify this exact product in the database. A manual check is recommended.',
        severity: 'info', severityPlain: plainSeverity('info'),
        fixText: 'Confirm the product name/version and check the vendor for updates.',
        declaredSoftwareId: item.id ?? null,
        enrichmentStatus: 'unavailable',
        idempotencyKey: idemKey(scanId, 'other', item.product, item.version, 'unresolved'),
      });
      continue;
    }

    for (const c of (app.cves ?? []).slice(0, MAX_CVES_PER_PRODUCT)) {
      const detail = await getCveDetail(c.cveId);
      let verdict: ReturnType<typeof isVersionAffected> = 'unknown';
      if (detail) {
        const match = detail.affectedApps?.find((a) => a.normalized === app.normalized);
        if (match) {
          verdict = isVersionAffected(item.version, {
            start: match.versionStart, end: match.versionEnd,
          });
        }
      }
      if (verdict === 'not_affected') continue; // version is outside the affected range

      const sev = severityFromCvss(c.cvssSeverity);
      out.push({
        scanId, source: 'other', confidence: 'advisory',
        title: `${app.vendor} ${app.product} ${item.version} — ${c.cveId}`,
        plainExplanation:
          (detail?.description ?? null) ??
          'A known vulnerability is reported for this product and version.',
        severity: sev, severityPlain: plainSeverity(sev),
        fixText:
          verdict === 'unknown'
            ? "We couldn't confirm your exact version — check the vendor and apply any updates."
            : 'We can\'t scan this device. Check the vendor for updates and apply them.',
        cveId: c.cveId,
        declaredSoftwareId: item.id ?? null,
        enrichmentStatus: detail ? 'done' : 'unavailable',
        idempotencyKey: idemKey(scanId, 'other', item.product, item.version, c.cveId),
      });
    }
  }

  await replaceSourceFindings(scanId, 'other', out);
  await setSourceStatus(scanId, 'other', { status: 'done', count: out.length });
  return { count: out.length };
}
