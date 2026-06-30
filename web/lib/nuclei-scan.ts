// Step-2 website vulnerability scan: nuclei automatic-scan (`-as`).
//
// Instead of running nuclei's full template library (slow, times out on CDN hosts, fragile to
// configure), we let nuclei FINGERPRINT the target (wappalyzer tech detection) and run only the
// templates that match its stack. Tens of templates, ~1-2 min, high hit-rate.
//
// We drive nuclei via `docker exec` on the existing Artemis nuclei container (it already has the
// binary + templates). The whole step is best-effort: any failure yields [] so the website tier
// still returns its Artemis findings.
import { spawn } from 'node:child_process';

const DOCKER_BIN = process.env.DOCKER_BIN || '/opt/homebrew/bin/docker';
const NUCLEI_CONTAINER = process.env.NUCLEI_CONTAINER || 'artemis-karton-nuclei-1';

export interface NucleiHit {
  templateId: string;
  name: string;
  severity: string; // critical | high | medium | low | info
  description: string | null;
  remediation: string | null;
  matchedAt: string | null;
  cve: string | null;
}

// Pure "technology X is present" detections — noise for a plain-language report. We keep
// meaningful info-level templates (EOL software, exposures, disclosures) and drop the rest.
const NOISE = /(^|-)detect$|tech-detect|wappalyzer|waf-detect|favicon|screenshot|fingerprinthub/i;
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

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

/** Run nuclei automatic-scan against a target. Best-effort: returns [] on any failure. */
export async function runNucleiAutomaticScan(
  domain: string,
  { timeoutMs = 200_000 }: { timeoutMs?: number } = {},
): Promise<NucleiHit[]> {
  const urls = [`https://${domain}/`, `http://${domain}/`];
  const args = [
    'exec', NUCLEI_CONTAINER, 'nuclei',
    ...urls.flatMap((u) => ['-u', u]),
    '-as',          // automatic scan: fingerprint -> matching templates only
    '-j',           // JSONL output
    '-silent',      // findings only on stdout
    '-no-color',
    '-duc',         // don't try to update templates (offline/fast)
    '-timeout', '10',
    '-rate-limit', '120',
  ];

  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (hits: NucleiHit[]) => {
      if (!settled) {
        settled = true;
        resolve(hits);
      }
    };
    let child;
    try {
      child = spawn(DOCKER_BIN, args, { timeout: timeoutMs });
    } catch {
      return done([]);
    }
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('error', () => done([]));
    child.on('close', () => {
      const seen = new Set<string>();
      const hits = out
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map(parseHit)
        .filter((h): h is NucleiHit => !!h && h.templateId.length > 0 && !NOISE.test(h.templateId))
        .filter((h) => (seen.has(h.templateId) ? false : (seen.add(h.templateId), true)));
      done(hits);
    });
  });
}
