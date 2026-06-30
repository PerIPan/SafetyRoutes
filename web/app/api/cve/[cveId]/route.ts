import { getCveDetail } from '@/lib/mitre';

// GET /api/cve/:cveId — mitre-explorer CVE detail (scoring + ATT&CK techniques) for the
// finding detail panel. Server proxy + cache; graceful 404 when unavailable.
export async function GET(_req: Request, ctx: { params: Promise<{ cveId: string }> }) {
  const { cveId } = await ctx.params;
  const d = await getCveDetail(cveId);
  return d ? Response.json(d) : Response.json({ error: 'No detail available' }, { status: 404 });
}
