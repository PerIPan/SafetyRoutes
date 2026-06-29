import { getScan, audit } from '@/lib/scans';
import { runWebsiteTier } from '@/lib/tiers/website';

// POST /api/scans/:id/start — kick off the async Website (Artemis) scan for the scan's domain.
// Fire-and-forget: returns immediately; the website tier updates scans.source_status as it runs.
// NOTE: in production this MUST be gated on verified domain ownership (security review R1).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });
  if (!scan.domain) {
    return Response.json({ error: 'This scan has no domain to check.' }, { status: 400 });
  }

  await audit(id, 'website_scan_started', { domain: scan.domain });
  // fire-and-forget (dev: the node server keeps the promise alive)
  void runWebsiteTier(id, scan.domain).catch(() => {});
  return Response.json({ started: true, domain: scan.domain });
}
