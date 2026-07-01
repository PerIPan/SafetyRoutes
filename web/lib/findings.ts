import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, query } from './db';
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
    isKev: (r.is_kev as boolean | null) ?? null,
    epss: (r.epss as number | null) ?? null,
    cvss: (r.cvss as number | null) ?? null,
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
    idempotencyKey: (r.idempotency_key as string | null) ?? null,
  };
}

async function insertFinding(client: PoolClient, f: Finding): Promise<void> {
  await client.query(
    `INSERT INTO findings
       (scan_id, source, confidence, title, plain_explanation, severity, severity_plain,
        fix_text, cve_id, artemis_finding_id, module, trivy_upload_id, purl, package_name,
        ecosystem, installed_version, fixed_version, declared_software_id, enrichment_status,
        idempotency_key, is_kev, epss, cvss)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT (scan_id, idempotency_key) DO NOTHING`,
    [
      f.scanId, f.source, f.confidence, f.title, f.plainExplanation ?? null, f.severity ?? null,
      f.severityPlain ?? null, f.fixText ?? null, f.cveId ?? null, f.artemisFindingId ?? null,
      f.module ?? null, f.trivyUploadId ?? null, f.purl ?? null, f.packageName ?? null,
      f.ecosystem ?? null, f.installedVersion ?? null, f.fixedVersion ?? null,
      f.declaredSoftwareId ?? null, f.enrichmentStatus ?? 'pending', f.idempotencyKey ?? null,
      f.isKev ?? null, f.epss ?? null, f.cvss ?? null,
    ],
  );
}

/** Supersede (replace) all findings for a scan+source atomically, so a concurrent report
 *  read never sees the table mid-rewrite. */
export async function replaceSourceFindings(
  scanId: string,
  source: FindingSource,
  findings: Finding[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // serialize concurrent re-ingest for the same scan
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${scanId}:${source}`]);
    await client.query(`DELETE FROM findings WHERE scan_id = $1 AND source = $2`, [scanId, source]);
    for (const f of findings) await insertFinding(client, f);
    // Invalidate any cached business report — its evidence just changed. Regenerated on next view.
    await client.query(
      `UPDATE scans SET business_report = NULL, business_report_model = NULL,
         business_report_at = NULL, updated_at = now() WHERE id = $1`,
      [scanId],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getFindings(scanId: string): Promise<Finding[]> {
  const rows = await query<Row>(
    `SELECT * FROM findings WHERE scan_id = $1
     ORDER BY
       CASE WHEN is_kev THEN 0 ELSE 1 END,                       -- actively-exploited first
       CASE confidence WHEN 'confirmed' THEN 0 WHEN 'advisory' THEN 1 ELSE 2 END,
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
                     WHEN 'low' THEN 3 ELSE 4 END,
       COALESCE(epss, 0) DESC,                                   -- likeliest-exploited tiebreak
       created_at`,
    [scanId],
  );
  return rows.map(rowToFinding);
}
