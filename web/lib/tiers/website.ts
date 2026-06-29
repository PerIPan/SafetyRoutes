// Website tier: drive Artemis (+ Nuclei) over the ArtemisGateway → Confirmed findings.
// Runs async (the wizard/report poll scans.source_status.website). Degrades gracefully when
// Artemis isn't configured/reachable.
import {
  artemisConfigured, startScan, waitForScan, fetchResults, type ArtemisTaskResult,
} from '../artemis';
import { plainSeverity } from '../severity';
import { idemKey, replaceSourceFindings } from '../findings';
import { setSourceStatus } from '../scans';
import type { Finding, FindingSeverity } from '../types';

function digSeverity(result: unknown): FindingSeverity | null {
  // Nuclei results carry info.severity; be defensive about shape.
  const r = result as { info?: { severity?: string }; severity?: string } | null;
  const s = (r?.info?.severity ?? r?.severity ?? '').toString().toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(s)) return s as FindingSeverity;
  return null;
}

function mapResult(scanId: string, r: ArtemisTaskResult): Finding | null {
  const title = r.statusReason?.trim() || (r.receiver ? `${r.receiver} finding` : null);
  if (!title) return null;
  const severity = digSeverity(r.result);
  return {
    scanId,
    source: 'website',
    confidence: 'confirmed',
    title,
    plainExplanation: r.target ? `Found at ${r.target}.` : null,
    severity,
    severityPlain: plainSeverity(severity),
    fixText: null,
    module: r.receiver,
    artemisFindingId: r.target ? `${r.receiver}:${r.target}` : r.receiver,
    enrichmentStatus: 'done',
    idempotencyKey: idemKey(scanId, 'website', r.receiver ?? '', title, r.target ?? ''),
  };
}

export async function runWebsiteTier(
  scanId: string,
  domain: string,
): Promise<{ count: number; status: string }> {
  if (!artemisConfigured()) {
    await setSourceStatus(scanId, 'website', {
      status: 'skipped',
      message: 'Artemis is not configured (set ARTEMIS_API_TOKEN).',
    });
    return { count: 0, status: 'skipped' };
  }

  await setSourceStatus(scanId, 'website', { status: 'running' });
  const analysisId = await startScan(domain, `sr-${scanId}`);
  if (!analysisId) {
    await setSourceStatus(scanId, 'website', {
      status: 'failed',
      message: 'Could not start the Artemis scan.',
    });
    return { count: 0, status: 'failed' };
  }

  const outcome = await waitForScan(analysisId); // 'done' | 'timed_out'
  const raw = await fetchResults(analysisId);
  const findings = raw.map((r) => mapResult(scanId, r)).filter((f): f is Finding => f !== null);

  await replaceSourceFindings(scanId, 'website', findings);
  await setSourceStatus(scanId, 'website', { status: outcome, count: findings.length });
  return { count: findings.length, status: outcome };
}
