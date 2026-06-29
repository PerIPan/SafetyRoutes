// Server-packages tier: ingest a Trivy report → Confirmed findings, enriched via mitre /packages.
// Trivy already gives the version verdict, so these are Confirmed regardless of enrichment.
import { parseTrivyReport } from '../trivy';
import { plainSeverity } from '../severity';
import { getPackageAdvisories } from '../mitre';
import { idemKey, replaceSourceFindings } from '../findings';
import { setSourceStatus } from '../scans';
import type { Finding } from '../types';

const MAX_ENRICH_CALLS = 60; // cap outbound mitre calls per scan (rest stay 'pending')

export interface PackagesTierResult {
  count: number;
  parsedCount: number;
  skippedCount: number;
}

export async function runPackagesTier(
  scanId: string,
  trivyJson: unknown,
  trivyUploadId: string | null,
  opts: { enrich?: boolean } = {},
): Promise<PackagesTierResult> {
  const enrich = opts.enrich ?? true;
  const { findings: tf, parsedCount, skippedCount } = parseTrivyReport(trivyJson);
  const out: Finding[] = [];
  let enrichCalls = 0;

  for (const f of tf) {
    let plainExplanation: string | null = f.title;
    let enrichmentStatus: Finding['enrichmentStatus'] = 'pending';

    if (enrich && f.ecosystem && enrichCalls < MAX_ENRICH_CALLS) {
      enrichCalls++;
      const pkg = await getPackageAdvisories(f.ecosystem, f.pkgName);
      if (pkg) {
        const adv = pkg.advisories.find((a) => a.cveId === f.vulnerabilityId);
        if (adv?.summary) plainExplanation = adv.summary;
        enrichmentStatus = 'done';
      } else {
        enrichmentStatus = 'unavailable';
      }
    }

    out.push({
      scanId,
      source: 'server',
      confidence: 'confirmed',
      title: `${f.pkgName} ${f.installedVersion ?? ''}`.trim() + ' has a known vulnerability',
      plainExplanation,
      severity: f.severity,
      severityPlain: plainSeverity(f.severity),
      fixText: f.fixedVersion
        ? `Update ${f.pkgName} to ${f.fixedVersion} (or newer).`
        : `Update ${f.pkgName} to a patched version.`,
      cveId: f.vulnerabilityId,
      trivyUploadId,
      purl: f.purl,
      packageName: f.pkgName,
      ecosystem: f.ecosystem,
      installedVersion: f.installedVersion,
      fixedVersion: f.fixedVersion,
      enrichmentStatus,
      idempotencyKey: idemKey(scanId, 'server', f.vulnerabilityId, f.purl ?? f.pkgName),
    });
  }

  await replaceSourceFindings(scanId, 'server', out);
  await setSourceStatus(scanId, 'server', { status: 'done', count: out.length });
  return { count: out.length, parsedCount, skippedCount };
}
