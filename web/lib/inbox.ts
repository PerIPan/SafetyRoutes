// Trivy "inbox" — the org's host pushes its `trivy fs /` report here on a schedule, so a fresh
// report is already waiting when a (non-technical) user later runs the wizard. Append-only history;
// "latest" is derived by received_at. Token model + adoption: see docs/trivy-auto-collect-todo.md.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { query, queryOne } from './db';
import { ensureDemoOrg } from './scans';

export interface InboxReport {
  id: string;
  orgId: string;
  sourceHost: string | null;
  rawJson: unknown;
  sha256: string;
  bytes: number;
  resultCount: number | null;
  vulnCount: number | null;
  receivedAt: string;
}

type Row = Record<string, unknown>;
function rowToInbox(r: Row): InboxReport {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    sourceHost: (r.source_host as string | null) ?? null,
    rawJson: r.raw_json,
    sha256: r.sha256 as string,
    bytes: r.bytes as number,
    resultCount: (r.result_count as number | null) ?? null,
    vulnCount: (r.vuln_count as number | null) ?? null,
    receivedAt: String(r.received_at),
  };
}

/** Get-or-create the org's STANDING ingest token (CSPRNG, 256-bit base64url). Generated server-side,
 *  persisted once; returned so the setup panel can display it. Concurrent callers converge on one
 *  token via `COALESCE(ingest_token, $new)`. */
export async function getOrgIngestToken(): Promise<{ orgId: string; token: string }> {
  const orgId = await ensureDemoOrg();
  const existing = await queryOne<{ ingest_token: string | null }>(
    `SELECT ingest_token FROM organizations WHERE id = $1`,
    [orgId],
  );
  if (existing?.ingest_token) return { orgId, token: existing.ingest_token };
  const fresh = randomBytes(32).toString('base64url');
  const updated = await queryOne<{ ingest_token: string }>(
    `UPDATE organizations SET ingest_token = COALESCE(ingest_token, $2), updated_at = now()
       WHERE id = $1
     RETURNING ingest_token`,
    [orgId, fresh],
  );
  return { orgId, token: updated!.ingest_token };
}

/** Constant-time verify a presented Bearer token → orgId, or null. Fail-closed: empty/blank → null.
 *  READ-ONLY — it must NOT provision a token (that only happens via getOrgIngestToken, called by the
 *  setup endpoint), so an unauthenticated POST can never mint the org secret. If no token has been
 *  provisioned yet, no valid auth is possible → null. Single-org POC: compares against the demo org's
 *  stored token, so there's no per-token DB lookup whose hit/miss leaks validity. Multi-org TODO:
 *  digest-column lookup keyed by a non-secret org id. */
export async function verifyIngestToken(presented: string | null | undefined): Promise<string | null> {
  if (!presented) return null;
  const orgId = await ensureDemoOrg();
  const row = await queryOne<{ ingest_token: string | null }>(
    `SELECT ingest_token FROM organizations WHERE id = $1`,
    [orgId],
  );
  const token = row?.ingest_token;
  if (!token) return null;
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  // length check leaks only the (fixed, public) token length, never the secret bytes
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? orgId : null;
}

/** Count Results[]/Vulnerabilities[] cheaply (for setup-panel display + structural caps). */
export function countTrivy(json: unknown): { resultCount: number; vulnCount: number } {
  const results = (json as { Results?: unknown }).Results;
  if (!Array.isArray(results)) return { resultCount: 0, vulnCount: 0 };
  let vulnCount = 0;
  for (const r of results) {
    const v = (r as { Vulnerabilities?: unknown })?.Vulnerabilities;
    if (Array.isArray(v)) vulnCount += v.length;
  }
  return { resultCount: results.length, vulnCount };
}

/** Append a pushed report to the inbox (immutable history row). */
export async function putInboxReport(input: {
  orgId: string;
  sourceHost: string | null;
  json: unknown;
  text: string;
}): Promise<InboxReport> {
  const sha256 = createHash('sha256').update(input.text).digest('hex');
  const bytes = Buffer.byteLength(input.text);
  const { resultCount, vulnCount } = countTrivy(input.json);
  const row = await queryOne<Row>(
    `INSERT INTO trivy_inbox (org_id, source_host, raw_json, sha256, bytes, result_count, vuln_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [input.orgId, input.sourceHost, input.json as object, sha256, bytes, resultCount, vulnCount],
  );
  return rowToInbox(row!);
}

/** The org's latest waiting report (or null if none ever pushed). Per-host grain folds in later via
 *  DISTINCT ON (source_host); for the single-server POC, newest wins. */
export async function getInboxReport(orgId: string): Promise<InboxReport | null> {
  const row = await queryOne<Row>(
    `SELECT * FROM trivy_inbox WHERE org_id = $1 ORDER BY received_at DESC LIMIT 1`,
    [orgId],
  );
  return row ? rowToInbox(row) : null;
}

/** Sanitize an untrusted collector-reported hostname: drop any :port, hostname charset only,
 *  length-capped. */
export function sanitizeSourceHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/:\d+$/, '') // strip a trailing :port so "host:8080" doesn't become "host8080"
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 253);
  return cleaned.length ? cleaned : null;
}
