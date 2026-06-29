import { getFindings } from '@/lib/findings';
import { buildReport } from '@/lib/report';
import { getScan } from '@/lib/scans';

// GET /api/scans/:id/report
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });
  const report = buildReport(await getFindings(id));
  return Response.json({ scan, ...report });
}
