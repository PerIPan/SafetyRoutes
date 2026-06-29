import { createHash } from 'node:crypto';
import { getScan } from '@/lib/scans';
import { queryOne, query } from '@/lib/db';
import { looksLikeTrivy } from '@/lib/trivy';
import { runPackagesTier } from '@/lib/tiers/packages';

const MAX_BYTES = 8_000_000; // ~8 MB — keep it small (untrusted upload)

// POST /api/scans/:id/trivy-upload — body is the raw Trivy JSON report.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });

  const text = await req.text();
  if (text.length > MAX_BYTES) {
    return Response.json({ error: 'Report too large (max 8 MB).' }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!looksLikeTrivy(json)) {
    return Response.json(
      { error: "This doesn't look like a Trivy JSON report (missing Results[])." },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const filename = url.searchParams.get('filename') ?? 'trivy-report.json';
  const key = createHash('sha256').update(text).digest('hex');

  const upload = await queryOne<{ id: string }>(
    `INSERT INTO trivy_uploads (scan_id, filename, raw_json, idempotency_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [id, filename, json as object, key],
  );

  try {
    const result = await runPackagesTier(id, json, upload!.id);
    await query(`UPDATE trivy_uploads SET parsed_count = $2, skipped_count = $3 WHERE id = $1`, [
      upload!.id, result.parsedCount, result.skippedCount,
    ]);
    return Response.json({ uploadId: upload!.id, ...result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
