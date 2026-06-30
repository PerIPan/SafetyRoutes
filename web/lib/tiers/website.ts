// Website tier: drive Artemis (+ Nuclei) over the ArtemisGateway → Confirmed findings.
// Runs async (the wizard/report poll scans.source_status.website). Degrades gracefully when
// Artemis isn't configured/reachable.
import {
  artemisConfigured, startScan, waitForScan, fetchResults, fetchCoverage, LCO_MODULES,
  type ArtemisTaskResult,
} from '../artemis';
import { nucleiSeverityForProfile, websiteTimeoutForProfile } from '../scan-profiles';
import { plainSeverity } from '../severity';
import { idemKey, replaceSourceFindings } from '../findings';
import { setSourceStatus, setScanArtemis } from '../scans';
import { runNucleiAutomaticScan } from '../nuclei-scan';
import type { Finding, FindingSeverity } from '../types';

// Interesting Artemis results can be indexed a few seconds after pending-tasks hits 0; settle
// before the final fetch so late findings aren't dropped.
const SETTLE_MS = 10_000;
// Web-facing modules (vs. infra-only: IP lookup, port scan, mail/DNS). If none of these produced
// a result, the public-website checks effectively didn't run (commonly because the site redirects
// elsewhere), so a green "no issues" would be misleading.
const WEB_MODULES = [
  'nuclei-module', 'nuclei-router', 'vcs', 'directory_index', 'robots', 'webapp_identifier',
];

// Friendly labels so a finding's title stays short/plain (some modules emit a paragraph).
const MODULE_LABEL: Record<string, string> = {
  mail_dns_scanner: 'Email & DNS setup',
  'nuclei-module': 'Known vulnerability',
  'nuclei-router': 'Known vulnerability',
  vcs: 'Exposed source control',
  directory_index: 'Exposed folder listing',
  robots: 'robots.txt',
  port_scanner: 'Open port',
  webapp_identifier: 'Web application',
  classifier: 'Site classification',
};

function digSeverity(result: unknown): FindingSeverity | null {
  // Nuclei results carry info.severity; be defensive about shape.
  const r = result as { info?: { severity?: string }; severity?: string } | null;
  const s = (r?.info?.severity ?? r?.severity ?? '').toString().toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(s)) return s as FindingSeverity;
  return null;
}

/** Pull a CVE id out of an Artemis/Nuclei result so the finding can be enriched
 *  (scoring + ATT&CK techniques) and linked. Nuclei carries it in info.classification or the
 *  template id; a JSON scan is the most robust across the varying shapes. */
function digCve(result: unknown): string | null {
  try {
    const m = JSON.stringify(result ?? '').match(/CVE-\d{4}-\d{3,7}/i);
    return m ? m[0].toUpperCase() : null;
  } catch {
    return null;
  }
}

// Ports a public website is expected to answer on — open 80/443 is normal, not a problem.
const WEB_PORTS = new Set(['80', '443']);

/** Pull port numbers out of a port_scanner result ({ "<ip>": { "<port>": {...} } }),
 *  falling back to parsing the "Found ports: 443 (...), 80 (...)" status reason. */
function portsFromResult(result: unknown, reason: string | null): string[] {
  const ports = new Set<string>();
  try {
    for (const v of Object.values((result ?? {}) as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        for (const p of Object.keys(v as Record<string, unknown>)) {
          if (/^\d{1,5}$/.test(p)) ports.add(p);
        }
      }
    }
  } catch {
    /* ignore malformed shapes */
  }
  if (ports.size === 0 && reason) {
    for (const m of reason.matchAll(/\b(\d{1,5})\b/g)) ports.add(m[1]);
  }
  return [...ports];
}

function mapResult(scanId: string, r: ArtemisTaskResult): Finding | null {
  const reason = r.statusReason?.trim() || null;
  const label = r.receiver ? (MODULE_LABEL[r.receiver] ?? r.receiver) : null;

  // Open ports get special handling: 80/443 are expected for any website, so don't alarm the user
  // with a "Confirmed — fix these" for them. Only surface NON-web services (e.g. databases, remote
  // login, admin panels) reachable from the internet — and only as an advisory worth checking.
  if (r.receiver === 'port_scanner') {
    const nonWeb = portsFromResult(r.result, reason).filter((p) => !WEB_PORTS.has(p));
    if (nonWeb.length === 0) return null;
    const list = nonWeb.join(', ');
    return {
      scanId,
      source: 'website',
      confidence: 'advisory',
      title: `Extra service${nonWeb.length > 1 ? 's' : ''} reachable from the internet (port ${list})`,
      plainExplanation:
        `Besides the normal website ports (80/443), your server also answers on ${list}. ` +
        `That can be fine, but anything not meant for the public — databases, remote login, admin panels — ` +
        `should be closed off or restricted.`,
      severity: 'low',
      severityPlain: plainSeverity('low'),
      fixText: `Check whether port ${list} needs to be open to everyone. If not, restrict it in your firewall or hosting panel.`,
      cveId: null,
      module: r.receiver,
      artemisFindingId: r.target ? `${r.receiver}:${r.target}` : r.receiver,
      enrichmentStatus: 'done',
      idempotencyKey: idemKey(scanId, 'website', r.receiver ?? '', 'extra-ports', r.target ?? '', list),
    };
  }
  // Some modules (e.g. mail_dns_scanner) put a whole paragraph in status_reason — keep the title
  // short and move the detail into the explanation.
  const title =
    reason && reason.length <= 90
      ? reason
      : label
        ? `${label} — needs attention`
        : reason
          ? `${reason.slice(0, 90)}…`
          : null;
  if (!title) return null;
  const longReason = reason && reason.length > 90 ? reason : null;
  const severity = digSeverity(r.result);
  return {
    scanId,
    source: 'website',
    confidence: 'confirmed',
    title,
    plainExplanation: longReason ?? (r.target ? `Found at ${r.target}.` : null),
    severity,
    severityPlain: plainSeverity(severity),
    fixText: null,
    cveId: digCve(r.result),
    module: r.receiver,
    artemisFindingId: r.target ? `${r.receiver}:${r.target}` : r.receiver,
    enrichmentStatus: 'done',
    // include a result discriminator so distinct findings with the same module/target/title
    // (e.g. several Nuclei hits) don't collide on the unique key and get dropped.
    idempotencyKey: idemKey(
      scanId, 'website', r.receiver ?? '', title, r.target ?? '',
      JSON.stringify(r.result ?? '').slice(0, 200),
    ),
  };
}

export async function runWebsiteTier(
  scanId: string,
  domain: string,
  modules: string[] = LCO_MODULES,
  profile?: string | null,
): Promise<{ count: number; status: string }> {
  if (!artemisConfigured()) {
    await setSourceStatus(scanId, 'website', {
      status: 'skipped',
      message: 'Artemis is not configured (set ARTEMIS_API_TOKEN).',
    });
    return { count: 0, status: 'skipped' };
  }

  // Depth-tied nuclei tuning: Essentials = critical_only (fast), Standard/Thorough widen coverage
  // and get a longer wait window so their findings actually land in the report.
  const severity = nucleiSeverityForProfile(profile);
  const timeoutMs = websiteTimeoutForProfile(profile);

  await setSourceStatus(scanId, 'website', { status: 'running' });
  const analysisId = await startScan(domain, `sr-${scanId}`, modules, severity);
  if (!analysisId) {
    await setSourceStatus(scanId, 'website', {
      status: 'failed',
      message: 'Could not start the Artemis scan.',
    });
    return { count: 0, status: 'failed' };
  }

  await setScanArtemis(scanId, analysisId); // C: persist which analysis backed this scan

  const outcome = await waitForScan(analysisId, { timeoutMs }); // 'done' | 'timed_out'

  // A: interesting results can land just after pending-tasks hits 0 — on a completed scan, settle,
  // re-fetch, and union (idempotency keys + the DB unique constraint dedupe overlaps) so late
  // findings (e.g. a mail/DNS result) aren't silently dropped.
  let raw = await fetchResults(analysisId);
  if (outcome === 'done') {
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    raw = raw.concat(await fetchResults(analysisId));
  }
  const findings = raw.map((r) => mapResult(scanId, r)).filter((f): f is Finding => f !== null);

  // Step 2: targeted nuclei automatic-scan (`-as`) — fingerprint the site (wappalyzer) and run only
  // the templates that match its stack. Decoupled from Artemis and best-effort (returns [] on any
  // failure), so the hygiene findings above are never blocked by it.
  try {
    const hits = await runNucleiAutomaticScan(domain);
    for (const h of hits) {
      const sev = (['critical', 'high', 'medium', 'low', 'info'].includes(h.severity)
        ? h.severity
        : 'info') as FindingSeverity;
      findings.push({
        scanId,
        source: 'website',
        confidence: sev === 'info' ? 'advisory' : 'confirmed',
        title: h.name,
        plainExplanation: h.description ?? (h.matchedAt ? `Detected at ${h.matchedAt}.` : null),
        severity: sev,
        severityPlain: plainSeverity(sev),
        fixText: h.remediation,
        cveId: h.cve,
        module: 'nuclei',
        artemisFindingId: `nuclei:${h.templateId}`,
        enrichmentStatus: 'done',
        idempotencyKey: idemKey(scanId, 'website', 'nuclei', h.templateId, h.matchedAt ?? ''),
      });
    }
  } catch {
    /* nuclei -as is optional — never fail the website tier on it */
  }

  // When a completed scan flagged nothing, be honest about what actually ran (C/D). If the
  // web-facing modules never produced a result (commonly a redirect to another host), don't issue
  // a green "all clear" — surface it as something to check (B: surfaced, not auto-followed, so we
  // never scan a host the user didn't authorise).
  if (findings.length === 0 && outcome === 'done') {
    const cov = await fetchCoverage(analysisId);
    const webRan = cov.modules.some((m) => WEB_MODULES.includes(m));
    findings.push(
      webRan
        ? {
            scanId, source: 'website', confidence: 'no_issue',
            title: `We checked ${domain} and found no obvious issues`,
            plainExplanation:
              `We ran ${cov.total} checks on your public website — including the vulnerability scan and exposed-file checks — and nothing was flagged.`,
            severity: 'info', severityPlain: plainSeverity('info'),
            fixText: 'Nothing to do here.',
            module: 'artemis', enrichmentStatus: 'done',
            idempotencyKey: idemKey(scanId, 'website', 'no_issue'),
          }
        : {
            scanId, source: 'website', confidence: 'advisory',
            title: `We couldn't fully check ${domain}'s website`,
            plainExplanation:
              `The deeper website checks (vulnerability scan, exposed-file checks) didn't return results for ${domain} — only the basic network and DNS checks did. This can happen when a site is a single-page app, sits behind a CDN/proxy, or opens at a different address.`,
            severity: 'info', severityPlain: plainSeverity('info'),
            fixText: domain.startsWith('www.')
              ? 'If your site opens at a different address, re-run the check against that one.'
              : `If your site opens at www.${domain}, re-run the check against that.`,
            module: 'artemis', enrichmentStatus: 'done',
            idempotencyKey: idemKey(scanId, 'website', 'thin_scan'),
          },
    );
  }

  await replaceSourceFindings(scanId, 'website', findings);
  await setSourceStatus(scanId, 'website', { status: outcome, count: findings.length });
  return { count: findings.length, status: outcome };
}
