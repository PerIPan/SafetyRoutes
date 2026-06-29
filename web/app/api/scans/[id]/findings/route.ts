import { getFindings } from '@/lib/findings';

// GET /api/scans/:id/findings
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json({ findings: await getFindings(id) });
}
