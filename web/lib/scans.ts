import { query, queryOne } from './db';
import type { FindingSource, Scan, ScanStatus, SourceStatus } from './types';

const DEMO_ORG = 'Demo organization';

/** Get-or-create the single demo org (no auth/multi-tenant for the bootcamp). */
export async function ensureDemoOrg(): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM organizations WHERE name = $1 LIMIT 1`, [DEMO_ORG],
  );
  if (existing) return existing.id;
  const created = await queryOne<{ id: string }>(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [DEMO_ORG],
  );
  return created!.id;
}

export interface CreateScanInput {
  domain?: string | null;
  consentBy?: string | null;
  ownershipVerified?: boolean;
  ownershipMethod?: string | null;
}

export async function createScan(input: CreateScanInput): Promise<string> {
  const orgId = await ensureDemoOrg();
  const row = await queryOne<{ id: string }>(
    `INSERT INTO scans (org_id, domain, status, consent_by, consent_at, ownership_verified, ownership_method)
     VALUES ($1, $2, 'pending', $3, now(), $4, $5)
     RETURNING id`,
    [
      orgId,
      input.domain ?? null,
      input.consentBy ?? null,
      input.ownershipVerified ?? false,
      input.ownershipMethod ?? null,
    ],
  );
  return row!.id;
}

type ScanRow = Record<string, unknown>;
function rowToScan(r: ScanRow): Scan {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    domain: r.domain as string | null,
    status: r.status as ScanStatus,
    sourceStatus: (r.source_status ?? {}) as Scan['sourceStatus'],
    createdAt: String(r.created_at),
  };
}

export async function getScan(id: string): Promise<Scan | null> {
  const r = await queryOne<ScanRow>(`SELECT * FROM scans WHERE id = $1`, [id]);
  return r ? rowToScan(r) : null;
}

export async function setScanStatus(id: string, status: ScanStatus): Promise<void> {
  await query(`UPDATE scans SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
}

/** Merge a per-source status into scans.source_status (jsonb). */
export async function setSourceStatus(
  id: string, source: FindingSource, status: SourceStatus,
): Promise<void> {
  await query(
    `UPDATE scans
        SET source_status = source_status || jsonb_build_object($2::text, $3::jsonb),
            updated_at = now()
      WHERE id = $1`,
    [id, source, JSON.stringify(status)],
  );
}

export async function audit(scanId: string | null, event: string, detail?: unknown): Promise<void> {
  await query(`INSERT INTO scan_audit (scan_id, event, detail) VALUES ($1, $2, $3)`,
    [scanId, event, detail ? JSON.stringify(detail) : null]);
}
