// Step-2 website vulnerability scan: nuclei automatic-scan (`-as`) + a fixed exposures overlay.
//
// `-as` fingerprints the target (wappalyzer) and runs only the templates matching its stack —
// tens, not the full 13,320 — so it's fast and times out far less than a full run. But `-as`
// ONLY runs tech-tagged templates, so tech-agnostic leaks (.env, backups, exposed config/panels)
// never run. We therefore also run a small fixed overlay (`http/exposures/` + `http/exposed-panels/`)
// in parallel and union the results.
//
// Everything is best-effort and reports an EXPLICIT run status (`ran` / `error` / `timeout` /
// `unreachable`) so the report never mistakes a failed or timed-out scan for a clean site.
import { spawn } from 'node:child_process';
import { isInternalScanHost } from './net-guard';

const DOCKER_BIN = process.env.DOCKER_BIN || '/opt/homebrew/bin/docker';
const NUCLEI_CONTAINER = process.env.NUCLEI_CONTAINER || 'artemis-karton-nuclei-1';

// Internal scan targets (e.g. the bundled DVWA test app) live on the scanner's Docker network and
// are NOT resolvable from the host — so the host-side scheme probe would wrongly report them
// unreachable. They're known-reachable over http from inside the nuclei container, so we skip the
// probe and scan http://<host> directly. Membership uses net-guard's `isInternalScanHost` so the
// AUTHORIZATION decision and the TARGET-construction decision share one normalized source of truth
// (a divergent local copy let an authorized host fall into the un-SSRF-guarded probe path).

export interface NucleiHit {
  templateId: string;
  templatePath: string; // e.g. "http/exposed-panels/wordpress-login.yaml" — used to classify
  name: string;
  severity: string; // critical | high | medium | low | info
  description: string | null;
  remediation: string | null;
  matchedAt: string | null;
  cve: string | null;
}

export interface NucleiResult {
  status: 'ran' | 'error' | 'timeout' | 'unreachable';
  hits: NucleiHit[];
  scheme: 'https' | 'http' | null; // which scheme we actually scanned
}

// Pure "technology X is present" detections — noise for a plain-language report. We keep
// meaningful info-level templates (EOL software, exposures, disclosures) and drop the rest.
const NOISE = /(^|-)detect$|tech-detect|wappalyzer|waf-detect|favicon|screenshot|fingerprinthub/i;
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

/** An exposed-panel discovery (an admin/login panel is reachable) — render as an advisory to
 *  "make sure it's protected", not a confirmed vulnerability. Real exposures (.env/backups) and
 *  CVEs are not panels and stay confirmed. */
export function isPanelHit(h: NucleiHit): boolean {
  return h.templatePath.includes('/exposed-panels/');
}

function parseHit(line: string): NucleiHit | null {
  try {
    const j = JSON.parse(line) as Record<string, unknown>;
    const info = (j.info ?? {}) as Record<string, unknown>;
    const cls = (info.classification ?? {}) as Record<string, unknown>;
    const rawCve = cls['cve-id'];
    const cve = Array.isArray(rawCve) ? rawCve[0] : rawCve;
    const sev = String(info.severity ?? 'info').toLowerCase();
    return {
      templateId: String(j['template-id'] ?? j['templateID'] ?? ''),
      templatePath: String(j['template'] ?? j['template-path'] ?? ''),
      name: String(info.name ?? j['template-id'] ?? 'Finding'),
      severity: SEVERITIES.includes(sev) ? sev : 'info',
      description: typeof info.description === 'string' ? info.description.trim() : null,
      remediation: typeof info.remediation === 'string' ? info.remediation.trim() : null,
      matchedAt: typeof j['matched-at'] === 'string' ? (j['matched-at'] as string) : null,
      cve: cve ? String(cve).toUpperCase() : null,
    };
  } catch {
    return null;
  }
}

/** Probe which scheme the site actually serves. Returns the URL, or null if neither scheme
 *  returns a real HTTP response (parked domain / unreachable — don't waste nuclei's budget). */
async function resolveTargetUrl(domain: string): Promise<string | null> {
  for (const scheme of ['https', 'http']) {
    const url = `${scheme}://${domain}/`;
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(6000) });
      // A real HTTP status (even 3xx/4xx/5xx) means the scheme is served. A TLS error or
      // connection reset throws → not served.
      if (res && typeof res.status === 'number' && res.status > 0) return url;
    } catch {
      /* try the next scheme */
    }
  }
  return null;
}

interface OneRun {
  hits: NucleiHit[];
  completed: boolean; // exited normally (not killed by the timeout)
  timedOut: boolean;
}

/** Run one nuclei invocation (docker exec) and parse its JSONL output. */
function runOneNuclei(args: string[], timeoutMs: number): Promise<OneRun> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (r: OneRun) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    let child;
    try {
      child = spawn(DOCKER_BIN, ['exec', NUCLEI_CONTAINER, 'nuclei', ...args], { timeout: timeoutMs });
    } catch {
      return done({ hits: [], completed: false, timedOut: false });
    }
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('error', () => done({ hits: [], completed: false, timedOut: false }));
    child.on('close', (_code: number | null, signal: NodeJS.Signals | null) => {
      const seen = new Set<string>();
      const hits = out
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map(parseHit)
        .filter((h): h is NucleiHit => !!h && h.templateId.length > 0 && !NOISE.test(h.templateId))
        .filter((h) => (seen.has(h.templateId) ? false : (seen.add(h.templateId), true)));
      // node's spawn timeout kills the process with a signal; a clean exit has signal == null.
      done({ hits, completed: signal == null, timedOut: signal != null });
    });
  });
}

/** Targeted website vuln scan: `nuclei -as` + a fixed exposures/panels overlay, in parallel,
 *  unioned by template id. Best-effort with an explicit run status. */
export async function runNucleiAutomaticScan(
  domain: string,
  { timeoutMs = 200_000 }: { timeoutMs?: number } = {},
): Promise<NucleiResult> {
  const target = isInternalScanHost(domain)
    ? `http://${domain}/` // Docker-internal test target: skip the host probe, scan over http in-container
    : await resolveTargetUrl(domain);
  if (!target) return { status: 'unreachable', hits: [], scheme: null };
  const scheme: 'https' | 'http' = target.startsWith('https') ? 'https' : 'http';

  const common = ['-j', '-silent', '-no-color', '-duc', '-timeout', '10'];
  const asArgs = ['-u', target, '-as', ...common, '-rate-limit', '120'];
  // Fixed overlay for the tech-agnostic gap. exposed-panels run discovery-only (no creds);
  // default-login templates (which submit a credential pair) are explicitly excluded to keep
  // the no-brute-force invariant.
  const overlayArgs = [
    '-u', target,
    '-t', 'http/exposures/',
    '-t', 'http/exposed-panels/',
    '-severity', 'low,medium,high,critical',
    '-exclude-tags', 'dos,fuzz,intrusive,default-login',
    ...common,
    '-rate-limit', '60',
  ];

  const [asRun, overlayRun] = await Promise.all([
    runOneNuclei(asArgs, timeoutMs),
    runOneNuclei(overlayArgs, timeoutMs),
  ]);

  // union by templateId (asRun first wins)
  const seen = new Set<string>();
  const hits = [...asRun.hits, ...overlayRun.hits].filter((h) =>
    seen.has(h.templateId) ? false : (seen.add(h.templateId), true),
  );

  let status: NucleiResult['status'];
  if (asRun.completed || overlayRun.completed) status = 'ran';
  else if (asRun.timedOut || overlayRun.timedOut) status = 'timeout';
  else status = 'error';

  return { status, hits, scheme };
}
