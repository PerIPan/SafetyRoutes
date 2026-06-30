import { getScan, setSourceStatus } from '@/lib/scans';
import { getInboxReport } from '@/lib/inbox';
import { runPackagesTier } from '@/lib/tiers/packages';
import { query, queryOne } from '@/lib/db';

// POST /api/scans/:id/adopt-server-report
// Fold the org's latest WAITING Trivy report (pushed earlier by the host-side collector) into THIS
// scan: snapshot the blob into a per-scan trivy_uploads row, then run the packages tier. This is how
// a pre-pushed report becomes part of a wizard run with zero manual upload. Idempotent per
// (scan, report-sha) — re-adopting the same report is a no-op. The snapshot means a later collector
// push can't mutate a scan that already adopted (architect review P1-4).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });

  const report = await getInboxReport(scan.orgId);
  if (!report) {
    await setSourceStatus(id, 'server', {
      status: 'skipped',
      message: 'No server report waiting — install the collector or upload a report.',
    });
    return Response.json({ adopted: false });
  }

  // Never silent-500: on any failure, record a 'failed' server status so the report shows something
  // honest instead of a blank section (the wizard fires this fire-and-forget).
  try {
    const upload = await queryOne<{ id: string }>(
      `INSERT INTO trivy_uploads (scan_id, filename, raw_json, idempotency_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scan_id, idempotency_key) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [id, `inbox:${report.sourceHost ?? 'server'}`, report.rawJson as object, report.sha256],
    );

    const result = await runPackagesTier(id, report.rawJson, upload!.id);
    await query(`UPDATE trivy_uploads SET parsed_count = $2, skipped_count = $3 WHERE id = $1`, [
      upload!.id,
      result.parsedCount,
      result.skippedCount,
    ]);

    return Response.json({
      adopted: true,
      receivedAt: report.receivedAt,
      sourceHost: report.sourceHost,
      ...result,
    });
  } catch (e) {
    await setSourceStatus(id, 'server', {
      status: 'failed',
      message: 'Could not process the waiting server report.',
    });
    return Response.json({ adopted: false, error: (e as Error).message }, { status: 200 });
  }
}
