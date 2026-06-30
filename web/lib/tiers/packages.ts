// Server-packages tier: ingest a Trivy report → Confirmed findings, enriched via mitre /packages.
// Trivy already gives the version verdict, so these are Confirmed regardless of enrichment.
import { parseTrivyReport } from '../trivy';
import { plainSeverity, severityFromCvss } from '../severity';
import { getCveDetail } from '../mitre';
import { idemKey, replaceSourceFindings } from '../findings';
import { setSourceStatus } from '../scans';
import type { Finding } from '../types';

const MAX_ENRICH_CALLS = 60; // cap outbound mitre calls per scan (rest stay 'pending')
const CVE_RE = /^CVE-\d{4}-\d+$/i; // validate the id before it becomes an outbound URL

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
    // the uploaded Severity is untrusted; we re-derive it from enrichment WHEN available (valid CVE
    // id + a cached/online CVSS). When enrichment is unavailable we fall back to the report's value.
    let severity = f.severity;
    let isKev: boolean | null = null;
    let epss: number | null = null;
    let cvss: number | null = null;
    let enrichmentStatus: Finding['enrichmentStatus'] = 'pending';

    if (enrich && CVE_RE.test(f.vulnerabilityId) && enrichCalls < MAX_ENRICH_CALLS) {
      enrichCalls++;
      const d = await getCveDetail(f.vulnerabilityId);
      if (d) {
        if (d.description) plainExplanation = d.description;
        const enrichedSev = severityFromCvss(d.cvssSeverity);
        if (enrichedSev) severity = enrichedSev; // authoritative over the report's own value
        isKev = d.isKev ?? null;
        epss = d.epssScore ?? null;
        cvss = d.cvssScore ?? null;
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
      severity,
      severityPlain: plainSeverity(severity),
      fixText: f.fixedVersion
        ? `Update ${f.pkgName} to ${f.fixedVersion} (or newer).`
        : `Update ${f.pkgName} to a patched version.`,
      cveId: f.vulnerabilityId,
      isKev,
      epss,
      cvss,
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

  if (out.length === 0) {
    out.push({
      scanId, source: 'server', confidence: 'no_issue',
      title: 'No known-vulnerable packages found on your server',
      plainExplanation:
        'We checked the packages in your Trivy report and none have known vulnerabilities.',
      severity: 'info', severityPlain: plainSeverity('info'),
      fixText: 'Keep your packages updated.',
      enrichmentStatus: 'done',
      idempotencyKey: idemKey(scanId, 'server', 'no_issue'),
    });
  }

  await replaceSourceFindings(scanId, 'server', out);
  await setSourceStatus(scanId, 'server', { status: 'done', count: out.length });
  return { count: out.length, parsedCount, skippedCount };
}
