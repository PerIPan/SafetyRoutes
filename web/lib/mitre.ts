// MitreExplorerClient — the single anti-corruption layer over mitre-explorer's live REST API.
// Owns: URL building (validated/encoded), DB-backed response caching (rate-limit defense),
// and graceful failure (returns null/empty on any error → enrichment is additive, never fatal).
import { query, queryOne } from './db';

const BASE = (process.env.MITRE_BASE_URL ?? 'https://mitre-explorer.org').replace(/\/$/, '');

// ── cache (mitre_cache table) ────────────────────────────────────────────────
async function cacheGet<T>(key: string): Promise<T | null> {
  const row = await queryOne<{ response_json: T; fetched_at: string; ttl_hours: number }>(
    `SELECT response_json, fetched_at, ttl_hours FROM mitre_cache WHERE cache_key = $1`,
    [key],
  );
  if (!row) return null;
  const ageHours = (Date.now() - new Date(row.fetched_at).getTime()) / 3_600_000;
  if (ageHours > row.ttl_hours) return null;
  return row.response_json;
}

async function cacheSet(key: string, json: unknown, ttlHours = 24): Promise<void> {
  await query(
    `INSERT INTO mitre_cache (cache_key, response_json, fetched_at, ttl_hours)
     VALUES ($1, $2::jsonb, now(), $3)
     ON CONFLICT (cache_key) DO UPDATE
       SET response_json = EXCLUDED.response_json, fetched_at = now(), ttl_hours = EXCLUDED.ttl_hours`,
    [key, JSON.stringify(json), ttlHours], // stringify so arrays aren't coerced to PG arrays
  );
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // network/timeout/parse — enrichment degrades, never throws
  }
}

/** Validate + encode a path segment before putting it in a mitre-explorer URL. */
function seg(s: string): string {
  return encodeURIComponent(s.trim());
}

// ── response shapes (partial — only what we use) ─────────────────────────────
export interface MitreAdvisory {
  id: string;            // GHSA-… or OSV native id
  cveId: string | null;
  summary: string | null;
  severity: string | null;
  cvssScore: number | null;
  vulnerableRange: string | null;
  fixedVersion: string | null;
}
export interface MitrePackageResult {
  ecosystem: string;
  packageName: string;
  source: 'GHSA' | 'OSV';
  advisories: MitreAdvisory[];
}

export interface MitreAppCve { cveId: string; cvssSeverity: string | null; isKev?: boolean }
export interface MitreAppResult {
  normalized: string;
  vendor: string;
  product: string;
  cves: MitreAppCve[];
}
export interface MitreCveDetail {
  cveId: string;
  cvssSeverity: string | null;
  isKev?: boolean;
  description?: string | null;
  affectedApps: { normalized: string; versionStart: string | null; versionEnd: string | null }[];
}

// ── public methods ───────────────────────────────────────────────────────────

/** Advisories for a package (Trivy enrichment). ecosystem+name → /packages/{eco}/{name}. */
export async function getPackageAdvisories(
  ecosystem: string,
  name: string,
): Promise<MitrePackageResult | null> {
  if (!ecosystem || !name) return null;
  const key = `pkg:${ecosystem.toLowerCase()}/${name.toLowerCase()}`;
  const cached = await cacheGet<MitrePackageResult>(key);
  if (cached) return cached;
  const data = await getJson<MitrePackageResult>(`/api/v1/packages/${seg(ecosystem)}/${seg(name)}`);
  if (data) await cacheSet(key, data, 12);
  return data;
}

export interface MitreAppSuggestion {
  vendor: string;
  product: string;
  normalized: string;
  cveCount: number | null;
}

/** Type-ahead: matching applications for a search string (for the wizard autocomplete). */
export async function searchApplications(q: string): Promise<MitreAppSuggestion[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const key = `appsuggest:${term.toLowerCase()}`;
  const cached = await cacheGet<MitreAppSuggestion[]>(key);
  if (cached) return cached;
  const list = await getJson<{
    data?: { vendor: string; product: string; normalized: string; cveCount?: number }[];
  }>(`/api/v1/applications?search=${encodeURIComponent(term)}&limit=8&sort=cve_count`);
  const items = (list?.data ?? []).map((d) => ({
    vendor: d.vendor,
    product: d.product,
    normalized: d.normalized,
    cveCount: d.cveCount ?? null,
  }));
  if (items.length) await cacheSet(key, items, 24);
  return items;
}

/** Resolve a free-text product to its mitre-explorer slug (vendor/product). */
export async function resolveApp(queryText: string): Promise<MitreAppResult | null> {
  const q = queryText.trim();
  if (q.length < 2) return null;
  const key = `appsearch:${q.toLowerCase()}`;
  const cached = await cacheGet<MitreAppResult>(key);
  if (cached) return cached;
  const list = await getJson<{ data?: { normalized: string; vendor: string; product: string }[] }>(
    `/api/v1/applications?search=${encodeURIComponent(q)}&limit=5`,
  );
  const top = list?.data?.[0];
  if (!top) return null;
  const app = await getApp(top.normalized);
  if (app) await cacheSet(key, app, 24);
  return app;
}

/** An app + its CVEs by exact slug. */
export async function getApp(slug: string): Promise<MitreAppResult | null> {
  const key = `app:${slug.toLowerCase()}`;
  const cached = await cacheGet<MitreAppResult>(key);
  if (cached) return cached;
  const data = await getJson<MitreAppResult>(`/api/v1/applications/${slug.split('/').map(seg).join('/')}`);
  if (data) await cacheSet(key, data, 6);
  return data;
}

/** Full CVE detail incl. per-app version ranges (for client-side version matching). */
export async function getCveDetail(cveId: string): Promise<MitreCveDetail | null> {
  if (!/^CVE-\d{4}-\d+$/i.test(cveId)) return null;
  const key = `cve:${cveId.toUpperCase()}`;
  const cached = await cacheGet<MitreCveDetail>(key);
  if (cached) return cached;
  const data = await getJson<MitreCveDetail>(`/api/v1/cves/${seg(cveId)}`);
  if (data) await cacheSet(key, data, 48);
  return data;
}
