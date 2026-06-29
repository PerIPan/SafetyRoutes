import { createHash } from 'node:crypto';
import { query } from './db';
import type { Finding, FindingSource } from './types';

/** Deterministic idempotency key so re-ingest doesn't duplicate findings. */
export function idemKey(...parts: (string | null | undefined)[]): string {
  return createHash('sha256').update(parts.map((p) => p ?? '').join('|')).digest('hex');
}

type Row = Record<string, unknown>;
function rowToFinding(r: Row): Finding {
  return {
    id: r.id as string,
    scanId: r.scan_id as string,
    source: r.source as FindingSource,
    confidence: r.confidence as Finding['confidence'],
    title: r.title as string,
    plainExplanation: r.plain_explanation as string | null,
    severity: r.severity as Finding['severity'],
    severityPlain: r.severity_plain as string | null,
    fixText: r.fix_text as string | null,
    cveId: r.cve_id as string | null,
    artemisFindingId: r.artemis_finding_id as string | null,
    module: r.module as string | null,
    trivyUploadId: r.trivy_upload_id as string | null,
    purl: r.purl as string | null,
    packageName: r.package_name as string | null,
    ecosystem: r.ecosystem as string | null,
    installedVersion: r.installed_version as string | null,
    fixedVersion: r.fixed_version as string | null,
    declaredSoftwareId: r.declared_software_id as string | null,
    enrichmentStatus: r.enrichment_status as Finding['enrichmentStatus'],
  };
}

async function insertFinding(f: Finding): Promise<void> {
  await query(
    `INSERT INTO findings
       (scan_id, source, confidence, title, plain_explanation, severity, severity_plain,
        fix_text, cve_id, artemis_finding_id, module, trivy_upload_id, purl, package_name,
        ecosystem, installed_version, fixed_version, declared_software_id, enrichment_status,
        idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (scan_id, idempotency_key) DO NOTHING`,
    [
      f.scanId, f.source, f.confidence, f.title, f.plainExplanation ?? null, f.severity ?? null,
      f.severityPlain ?? null, f.fixText ?? null, f.cveId ?? null, f.artemisFindingId ?? null,
      f.module ?? null, f.trivyUploadId ?? null, f.purl ?? null, f.packageName ?? null,
      f.ecosystem ?? null, f.installedVersion ?? null, f.fixedVersion ?? null,
      f.declaredSoftwareId ?? null, f.enrichmentStatus ?? 'pending', f.idempotencyKey ?? null,
    ],
  );
}

/** Supersede (replace) all findings for a scan+source, then insert the new batch. */
export async function replaceSourceFindings(
  scanId: string,
  source: FindingSource,
  findings: Finding[],
): Promise<void> {
  await query(`DELETE FROM findings WHERE scan_id = $1 AND source = $2`, [scanId, source]);
  for (const f of findings) await insertFinding(f);
}

export async function getFindings(scanId: string): Promise<Finding[]> {
  const rows = await query<Row>(
    `SELECT * FROM findings WHERE scan_id = $1
     ORDER BY
       CASE confidence WHEN 'confirmed' THEN 0 WHEN 'advisory' THEN 1 ELSE 2 END,
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
                     WHEN 'low' THEN 3 ELSE 4 END,
       created_at`,
    [scanId],
  );
  return rows.map(rowToFinding);
}
