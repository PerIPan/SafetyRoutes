// Website tier: drive Artemis (+ Nuclei) over the ArtemisGateway → Confirmed findings.
// Runs async (the wizard/report poll scans.source_status.website). Degrades gracefully when
// Artemis isn't configured/reachable.
import {
  artemisConfigured, startScan, waitForScan, fetchResults, fetchCoverage, LCO_MODULES,
  type ArtemisTaskResult,
} from '../artemis';
import { websiteTimeoutForProfile } from '../scan-profiles';
import { plainSeverity } from '../severity';
import { idemKey, replaceSourceFindings } from '../findings';
import { setSourceStatus, setScanArtemis } from '../scans';
import { runNucleiAutomaticScan, isPanelHit, type NucleiResult } from '../nuclei-scan';
import type { Finding, FindingSeverity } from '../types';

// Interesting Artemis results can be indexed a few seconds after pending-tasks hits 0; settle
// before the final fetch so late findings aren't dropped.
const SETTLE_MS = 10_000;
// Web-facing Artemis modules (vs. infra-only: IP lookup, port scan, mail/DNS). If none of these
// produced a result, the public-website checks effectively didn't run (commonly because the site
// redirects elsewhere), so a green "no issues" would be misleading. (nuclei is no longer an
// Artemis module — its run-state is tracked separately via the NucleiResult status.)
const WEB_MODULES = ['vcs', 'directory_index', 'robots', 'webapp_identifier'];

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

  // Depth tunes how long we wait for Artemis (the vuln scan is a separate nuclei -as step).
  const timeoutMs = websiteTimeoutForProfile(profile);

  await setSourceStatus(scanId, 'website', { status: 'running' });
  const analysisId = await startScan(domain, `sr-${scanId}`, modules);
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

  // Step 2: targeted nuclei vuln scan — `-as` (fingerprint → matching templates) + a fixed
  // exposures/exposed-panels overlay. Best-effort; the explicit run status gates the "no issues"
  // message below so a failed/timed-out scan never reads as a clean site.
  let nuclei: NucleiResult = { status: 'error', hits: [], scheme: null };
  try {
    nuclei = await runNucleiAutomaticScan(domain);
  } catch {
    /* keep the safe default */
  }
  for (const h of nuclei.hits) {
    const sev = (['critical', 'high', 'medium', 'low', 'info'].includes(h.severity)
      ? h.severity
      : 'info') as FindingSeverity;
    const panel = isPanelHit(h);
    findings.push({
      scanId,
      source: 'website',
      // exposed-panel hits are discovery only → advisory ("make sure it's protected").
      confidence: panel || sev === 'info' ? 'advisory' : 'confirmed',
      title: panel ? `Admin/login panel reachable: ${h.name}` : h.name,
      plainExplanation: panel
        ? `An admin or login panel (${h.name}) is reachable from the internet${
            h.matchedAt ? ` at ${h.matchedAt}` : ''
          }. That can be fine, but make sure it's behind a strong password and not exposed unnecessarily.`
        : (h.description ?? (h.matchedAt ? `Found at ${h.matchedAt}.` : null)),
      severity: sev,
      severityPlain: plainSeverity(sev),
      fixText: panel
        ? 'Confirm this panel needs to be public; if not, restrict it (IP allowlist / VPN / take it offline).'
        : h.remediation,
      cveId: h.cve,
      module: 'nuclei',
      artemisFindingId: `nuclei:${h.templateId}`,
      enrichmentStatus: 'done',
      idempotencyKey: idemKey(scanId, 'website', 'nuclei', h.templateId, h.matchedAt ?? ''),
    });
  }

  // The site answers on plain http but not https — a real (low-severity) finding for an LCO.
  if (nuclei.scheme === 'http') {
    findings.push({
      scanId,
      source: 'website',
      confidence: 'advisory',
      title: `${domain} isn't served over a secure (https) connection`,
      plainExplanation:
        `Your website answers on plain http but we couldn't reach it over https, so visitors' ` +
        `connections aren't encrypted. Browsers increasingly warn people, and it undermines trust.`,
      severity: 'low',
      severityPlain: plainSeverity('low'),
      fixText: 'Add a free TLS certificate (e.g. Let’s Encrypt, or one-click via your host) to serve the site over https.',
      cveId: null,
      module: 'nuclei',
      artemisFindingId: 'nuclei:no-https',
      enrichmentStatus: 'done',
      idempotencyKey: idemKey(scanId, 'website', 'no-https'),
    });
  }

  // When nothing was flagged, be honest about what actually ran. A green "all clear" is ONLY
  // safe when the Artemis web-modules ran AND the nuclei vuln scan genuinely ran — otherwise a
  // failed/timed-out scan would masquerade as a clean site (the most dangerous LCO-facing bug).
  if (findings.length === 0) {
    const cov = await fetchCoverage(analysisId);
    const webRan = cov.modules.some((m) => WEB_MODULES.includes(m));
    const trulyClean = outcome === 'done' && webRan && nuclei.status === 'ran';
    findings.push(
      trulyClean
        ? {
            scanId, source: 'website', confidence: 'no_issue',
            title: `We checked ${domain} and found no obvious issues`,
            plainExplanation:
              `We ran the website checks — the vulnerability scan, exposed-file checks, and email/DNS — and nothing was flagged.`,
            severity: 'info', severityPlain: plainSeverity('info'),
            fixText: 'Nothing to do here.',
            module: 'artemis', enrichmentStatus: 'done',
            idempotencyKey: idemKey(scanId, 'website', 'no_issue'),
          }
        : {
            scanId, source: 'website', confidence: 'advisory',
            title: `We couldn't fully check ${domain}'s website`,
            plainExplanation:
              nuclei.status === 'unreachable'
                ? `We couldn't reach ${domain} over http or https, so the vulnerability scan didn't run. This is *not* a clean bill of health. It usually means the site opens at a different address (e.g. www.), is a single-page app, or sits behind a CDN/proxy.`
                : `The vulnerability scan didn't finish for ${domain} (it ${nuclei.status === 'timeout' ? 'timed out' : "couldn't complete"}), so this is *not* a clean bill of health. This can happen on slow hosts, single-page apps, or sites behind a CDN/proxy.`,
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
