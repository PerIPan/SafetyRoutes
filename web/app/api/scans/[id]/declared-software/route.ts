import { getScan } from '@/lib/scans';
import { queryOne } from '@/lib/db';
import { runManualTier, type DeclaredItem } from '@/lib/tiers/manual';

// POST /api/scans/:id/declared-software — body: { items: [{ vendor?, product, version }] }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const items: unknown[] = Array.isArray(body.items) ? body.items : [];

  const declared: DeclaredItem[] = [];
  for (const raw of items.slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    const product = typeof it.product === 'string' ? it.product.trim() : '';
    const version = typeof it.version === 'string' ? it.version.trim() : '';
    if (!product || !version) continue;
    const vendor = typeof it.vendor === 'string' ? it.vendor.trim() : null;
    const row = await queryOne<{ id: string }>(
      `INSERT INTO declared_software (scan_id, vendor, product, version)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [id, vendor, product, version],
    );
    declared.push({ id: row!.id, vendor, product, version });
  }

  const result = await runManualTier(id, declared);
  return Response.json(result);
}
