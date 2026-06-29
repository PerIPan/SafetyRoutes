import { getScan } from '@/lib/scans';

// GET /api/scans/:id — scan status + per-source status (the wizard polls this).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });
  return Response.json(scan);
}
