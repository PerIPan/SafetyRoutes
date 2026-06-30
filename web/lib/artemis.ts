// ArtemisGateway — wraps Artemis's HTTP API behind OUR interface, so the website tier codes
// against this contract, not Artemis internals. Endpoints/fields per the API review (v2.7.0);
// parsed defensively because Artemis is experimental and module `result` shapes vary.
//
// Config (web/.env.local): ARTEMIS_API_URL (default http://localhost:5000), ARTEMIS_API_TOKEN.

const ARTEMIS_URL = (process.env.ARTEMIS_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');
const ARTEMIS_TOKEN = process.env.ARTEMIS_API_TOKEN ?? '';

// Scan-depth → Artemis module sets. The wizard lets the org dial how much of Artemis runs; all
// three sets are safe/low-impact for LCOs (intrusive/brute modules deliberately excluded) and
// differ only in breadth. Presentation copy (labels/blurbs/help) lives in lib/scan-profiles.ts —
// the single client-safe source of truth — so this file owns only the module mapping.
import type { ScanProfileKey } from './scan-profiles';

// Core web checks — the actual point of this tier. IDs are Artemis Karton *identities* and must
// match /api/get-modules-that-can-be-disabled exactly — note the HYPHENS in "nuclei-module" /
// "nuclei-router"; sending "nuclei" silently drops it from enabled_modules (Artemis then disables
// it). `classifier` and `webapp_identifier` are always-on (not disableable) so they run regardless.
// port_scanner is the ENTRY POINT: it discovers the open HTTP service that webapp_identifier ->
// nuclei-router -> nuclei-module (and vcs/directory_index/robots) then scan — so it must be in
// every profile, or the web vulnerability scan can never run.
// LCO-focused module set: only safe, low-impact, high-value checks for Local Community
// Organizations. We deliberately EXCLUDE Artemis's brute-forcers (ftp/ssh/mysql/postgresql/
// wordpress/admin-panel/bruter) and active injectors (sql/lfi/orm injection, api fuzzing) —
// those guess credentials or send attack payloads, which violates good-faith, low-impact
// scanning. Artemis's bundled Nuclei (nuclei-module/router) is also out: the targeted vuln scan
// runs as a decoupled `nuclei -as` step (see lib/nuclei-scan.ts) that only runs templates
// matching the site's fingerprint. See the README "What we scan — and what we don't".
const CORE_WEB = [
  'port_scanner',    // open ports / attack surface
  'vcs',             // exposed .git / source-control leak
  'directory_index', // exposed directory listings
  'robots',          // robots.txt disclosure
  'humble',          // HTTP security headers (missing headers = an easy hardening win)
];

export const MODULE_SETS: Record<ScanProfileKey, string[]> = {
  essentials: CORE_WEB,
  standard: [...CORE_WEB, 'mail_dns_scanner', 'domain_expiration_scanner'],
  thorough: [
    ...CORE_WEB,
    'mail_dns_scanner',
    'domain_expiration_scanner',
    'dns_scanner',
    'dangling_dns_detector',
  ],
};

// Back-compat default profile (the original fixed LCO set == Thorough).
export const LCO_MODULES = MODULE_SETS.thorough;

/** Resolve a stored profile key to its Artemis module set (defaults to Standard). */
export function modulesForProfile(profile?: string | null): string[] {
  return MODULE_SETS[profile as ScanProfileKey] ?? MODULE_SETS.standard;
}

export function artemisConfigured(): boolean {
  return ARTEMIS_TOKEN.length > 0;
}

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${ARTEMIS_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'X-Api-Token': ARTEMIS_TOKEN,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    return null;
  }
}

export interface ArtemisTaskResult {
  receiver: string | null; // module name
  statusReason: string | null;
  status: string | null;
  target: string | null;
  result: unknown;
}

/** Modules Artemis allows to be toggled (others are always-on and can't go in enabled_modules). */
export async function disableableModules(): Promise<string[] | null> {
  const list = await api<{ identity: string }[]>('/api/get-modules-that-can-be-disabled');
  if (!Array.isArray(list)) return null;
  return list.map((m) => m.identity);
}

/** Start a scan. Returns the analysis id (or null on failure).
 *  enabled_modules MUST be a subset of the disable-able modules, so we intersect first;
 *  if that list is unavailable we omit enabled_modules and use Artemis's default profile
 *  (intrusive/brute modules are already off by default). */
export async function startScan(
  domain: string,
  tag: string,
  modules: string[] = LCO_MODULES,
  // nuclei severity_threshold (Artemis per-scan runtime config). Lower thresholds run fewer
  // templates → faster scans. Omitted ⇒ Artemis's global default (high_and_above).
  severity?: string | null,
): Promise<string | null> {
  const allowed = await disableableModules();
  // Refuse to scan if we can't confirm the module set — better to fail than fall back to
  // Artemis's full default profile on a transient API hiccup (security/safety).
  if (!allowed) return null;
  const enabled = modules.filter((m) => allowed.includes(m));
  const payload: Record<string, unknown> = { targets: [domain], tag };
  if (enabled.length) payload.enabled_modules = enabled;
  // Per-scan nuclei tuning. Key is "nuclei" (the API validates against RUNTIME_CONFIGURATION_CLASSES
  // which is keyed "nuclei"; the module reads it via a "nuclei" fallback). Read at task time — no
  // Artemis restart needed.
  if (severity) {
    payload.module_runtime_configurations = { nuclei: { severity_threshold: severity } };
  }

  const body = await api<unknown>('/api/add', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!body) return null;
  if ((body as { error?: string }).error) return null;
  // response may be { ids: [...] } or an array of ids/objects — parse defensively
  const ids =
    (body as { ids?: unknown[] }).ids ??
    (Array.isArray(body) ? body : null);
  const first = Array.isArray(ids) ? ids[0] : null;
  const rawId =
    typeof first === 'string'
      ? first
      : first && typeof first === 'object' && 'id' in first
        ? String((first as { id: unknown }).id)
        : null;
  if (!rawId) return null;
  // Artemis/Karton returns a task fquid like "{root_uid}:{uid}"; the ANALYSIS id is the root_uid
  // (the first UUID). Without this, isDone never matches the analysis (instant false "done") and
  // fetchResults/fetchCoverage query a garbage id and silently return nothing — i.e. every scan
  // looked instantly "done" with no findings. Normalize to the bare analysis UUID.
  const uuid = rawId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuid ? uuid[0] : rawId;
}

/** Best-effort "is this analysis finished" check (Artemis has no single done flag). */
export async function isDone(analysisId: string): Promise<boolean> {
  const analyses = await api<unknown[]>('/api/analyses');
  if (!Array.isArray(analyses)) return false;
  const a = analyses.find(
    (x) => x && typeof x === 'object' && String((x as { id?: unknown }).id) === analysisId,
  ) as { num_pending_tasks?: number } | undefined;
  if (!a) return true; // API reachable but analysis absent → gone/finished (terminal), not pending
  // Rely on the per-analysis pending count. The global /num-queued-tasks includes unrelated
  // background tasks (cleanup/autoarchiver/metrics) and would keep us "running" forever.
  // waitForScan's two-consecutive-zero stabilization handles the last-task race.
  return (a.num_pending_tasks ?? 0) === 0;
}

/** Poll until done (two consecutive zero-readings) or timeout. */
export async function waitForScan(
  analysisId: string,
  { intervalMs = 10000, timeoutMs = 20 * 60 * 1000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<'done' | 'timed_out'> {
  const start = Date.now();
  let zeros = 0;
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (await isDone(analysisId)) {
      if (++zeros >= 2) return 'done';
    } else {
      zeros = 0;
    }
  }
  return 'timed_out';
}

/** Fetch interesting task results for an analysis (paginated). */
export async function fetchResults(analysisId: string): Promise<ArtemisTaskResult[]> {
  const out: ArtemisTaskResult[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await api<unknown>(
      `/api/task-results?analysis_id=${encodeURIComponent(analysisId)}&only_interesting=true&page=${page}&page_size=200`,
    );
    const rows: unknown[] = Array.isArray(data)
      ? data
      : ((data as { data?: unknown[]; results?: unknown[] })?.data ??
         (data as { results?: unknown[] })?.results ??
         []);
    if (!rows.length) break;
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      out.push({
        receiver: (o.receiver as string) ?? (o.headers as Record<string, unknown>)?.receiver as string ?? null,
        statusReason: (o.status_reason as string) ?? null,
        status: (o.status as string) ?? null,
        target: (o.target as string) ?? (o.payload as Record<string, unknown>)?.['url'] as string ?? null,
        result: o.result ?? null,
      });
    }
    if (rows.length < 200) break;
  }
  return out;
}

/** Coverage for an analysis: total task-results and which modules produced any — so a clean
 *  result is auditable ("we ran N checks across these modules"), not indistinguishable from a
 *  thin/empty scan. Hits only_interesting=false (every task, not just the flagged ones). */
export async function fetchCoverage(
  analysisId: string,
): Promise<{ total: number; modules: string[] }> {
  const modules = new Set<string>();
  let total = 0;
  for (let page = 1; page <= 20; page++) {
    const data = await api<unknown>(
      `/api/task-results?analysis_id=${encodeURIComponent(analysisId)}&only_interesting=false&page=${page}&page_size=300`,
    );
    const rows: unknown[] = Array.isArray(data)
      ? data
      : ((data as { data?: unknown[]; results?: unknown[] })?.data ??
         (data as { results?: unknown[] })?.results ??
         []);
    if (!rows.length) break;
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const rec =
        (o.receiver as string) ?? ((o.headers as Record<string, unknown>)?.receiver as string);
      if (rec) modules.add(rec);
      total++;
    }
    if (rows.length < 300) break;
  }
  return { total, modules: [...modules] };
}
