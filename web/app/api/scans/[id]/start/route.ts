import { getScan, audit, setSourceStatus } from '@/lib/scans';
import { runWebsiteTier } from '@/lib/tiers/website';
import { authorizeScan } from '@/lib/net-guard';
import { modulesForProfile } from '@/lib/artemis';

// POST /api/scans/:id/start — kick off the async Website (Artemis) scan for the scan's domain.
// Gated by an allowlist + SSRF check (security review #1). Fire-and-forget: returns immediately;
// the website tier updates scans.source_status as it runs (and on error).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });
  if (!scan.domain) {
    return Response.json({ error: 'This scan has no domain to check.' }, { status: 400 });
  }

  const gate = await authorizeScan(scan.domain);
  if (!gate.ok) {
    await audit(id, 'website_scan_denied', { domain: scan.domain, reason: gate.reason });
    return Response.json({ error: gate.reason }, { status: 403 });
  }

  const modules = modulesForProfile(scan.profile);
  await audit(id, 'website_scan_started', { domain: scan.domain, profile: scan.profile, modules });
  // fire-and-forget (dev keeps the promise alive; on a serverless host this needs a worker/queue).
  void runWebsiteTier(id, scan.domain, modules, scan.profile).catch(async (e) => {
    await setSourceStatus(id, 'website', { status: 'failed', message: String(e) }).catch(() => {});
    await audit(id, 'website_scan_error', { error: String(e) }).catch(() => {});
  });
  return Response.json({ started: true, domain: scan.domain });
}
