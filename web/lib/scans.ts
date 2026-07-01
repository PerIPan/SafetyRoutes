import { randomUUID } from 'node:crypto';
import { query, queryOne } from './db';
import { isScanProfile, DEFAULT_SCAN_PROFILE } from './scan-profiles';
import type {
  AuthorizationSnapshot, BusinessReport, FindingSource, OrgContext,
  Scan, ScanStatus, SourceStatus,
} from './types';

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
  profile?: string | null; // website scan depth
  // org-context (optional) — captured for the authorization record + business-report tailoring
  organizationName?: string | null;
  contactEmail?: string | null;
  whatOrgDoes?: string | null;
  whoWeServe?: string | null;
  sensitiveData?: string | null;
}

const trimOrNull = (v: string | null | undefined): string | null => v?.trim() || null;

export async function createScan(input: CreateScanInput): Promise<string> {
  const orgId = await ensureDemoOrg();
  const profile = isScanProfile(input.profile) ? input.profile : DEFAULT_SCAN_PROFILE;

  // Immutable consent record — printed verbatim on the authorization page.
  const authorization: AuthorizationSnapshot = {
    organizationName: trimOrNull(input.organizationName) ?? 'Organization',
    authorizedBy: trimOrNull(input.consentBy) ?? 'Authorized representative',
    contactEmail: trimOrNull(input.contactEmail),
    domain: input.domain ?? null,
    profile,
    acceptedAt: new Date().toISOString(),
    authorizationId: `SR-${randomUUID().slice(0, 8).toUpperCase()}`,
  };
  // Mutable prompt-conditioning — null when the org supplied nothing.
  const orgCtx: OrgContext = {
    whatOrgDoes: trimOrNull(input.whatOrgDoes),
    whoWeServe: trimOrNull(input.whoWeServe),
    sensitiveData: trimOrNull(input.sensitiveData),
  };
  const hasOrgCtx = !!(orgCtx.whatOrgDoes || orgCtx.whoWeServe || orgCtx.sensitiveData);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO scans
       (org_id, domain, status, consent_by, consent_at, ownership_verified, ownership_method,
        scan_profile, upload_token, authorization_snapshot, org_context)
     VALUES ($1, $2, 'pending', $3, now(), $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     RETURNING id`,
    [
      orgId,
      input.domain ?? null,
      input.consentBy ?? null,
      input.ownershipVerified ?? false,
      input.ownershipMethod ?? null,
      profile,
      randomUUID().replace(/-/g, ''),
      JSON.stringify(authorization),
      hasOrgCtx ? JSON.stringify(orgCtx) : null,
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
    profile: (r.scan_profile as string) ?? 'standard',
    uploadToken: (r.upload_token as string | null) ?? null,
    sourceStatus: (r.source_status ?? {}) as Scan['sourceStatus'],
    createdAt: String(r.created_at),
    authorization: (r.authorization_snapshot as AuthorizationSnapshot | null) ?? null,
    orgContext: (r.org_context as OrgContext | null) ?? null,
    businessReport: (r.business_report as BusinessReport | null) ?? null,
  };
}

/** Cache the generated (or fallback) business report. Invalidated by replaceSourceFindings. */
export async function saveBusinessReport(
  id: string, report: BusinessReport, model: string,
): Promise<void> {
  await query(
    `UPDATE scans SET business_report = $2::jsonb, business_report_model = $3,
       business_report_at = now(), updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(report), model],
  );
}

export async function getScan(id: string): Promise<Scan | null> {
  const r = await queryOne<ScanRow>(`SELECT * FROM scans WHERE id = $1`, [id]);
  return r ? rowToScan(r) : null;
}

export async function setScanStatus(id: string, status: ScanStatus): Promise<void> {
  await query(`UPDATE scans SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
}

/** Record which Artemis analysis backed this scan (auditability — so a clean website result can
 *  be traced to a real analysis + its task coverage). */
export async function setScanArtemis(id: string, analysisId: string): Promise<void> {
  await query(
    `UPDATE scans SET artemis_analysis_id = $2, updated_at = now() WHERE id = $1`,
    [id, analysisId],
  );
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
