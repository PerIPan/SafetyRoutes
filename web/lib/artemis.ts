// ArtemisGateway — wraps Artemis's HTTP API behind OUR interface, so the website tier codes
// against this contract, not Artemis internals. Endpoints/fields per the API review (v2.7.0);
// parsed defensively because Artemis is experimental and module `result` shapes vary.
//
// Config (web/.env.local): ARTEMIS_API_URL (default http://localhost:5000), ARTEMIS_API_TOKEN.

const ARTEMIS_URL = (process.env.ARTEMIS_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');
const ARTEMIS_TOKEN = process.env.ARTEMIS_API_TOKEN ?? '';

// A safe, low-impact module profile for LCOs (intrusive/brute modules deliberately excluded).
export const LCO_MODULES = [
  'classifier',
  'webapp_identifier',
  'nuclei',
  'nuclei_router',
  'vcs',
  'directory_index',
  'robots',
  'mail_dns_scanner',
  'port_scanner',
];

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
): Promise<string | null> {
  const allowed = await disableableModules();
  const enabled = allowed ? modules.filter((m) => allowed.includes(m)) : null;
  const payload: Record<string, unknown> = { targets: [domain], tag };
  if (enabled && enabled.length) payload.enabled_modules = enabled;

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
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && 'id' in first) return String((first as { id: unknown }).id);
  return null;
}

/** Best-effort "is this analysis finished" check (Artemis has no single done flag). */
export async function isDone(analysisId: string): Promise<boolean> {
  const analyses = await api<unknown[]>('/api/analyses');
  if (!Array.isArray(analyses)) return false;
  const a = analyses.find(
    (x) => x && typeof x === 'object' && String((x as { id?: unknown }).id) === analysisId,
  ) as { num_pending_tasks?: number } | undefined;
  const queued = await api<number | { value?: number }>('/api/num-queued-tasks');
  const queuedN = typeof queued === 'number' ? queued : (queued?.value ?? 0);
  return (a?.num_pending_tasks ?? 1) === 0 && queuedN === 0;
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
