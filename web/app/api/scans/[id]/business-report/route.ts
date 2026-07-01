import { getFindings } from '@/lib/findings';
import { selectForReport } from '@/lib/report';
import { fallbackBusinessReport, generateBusinessReport } from '@/lib/business-report';
import type { ReportInputs } from '@/lib/business-report';
import { audit, getScan, saveBusinessReport } from '@/lib/scans';

// GET /api/scans/:id/business-report — return the cached summary (or null if not generated yet).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });
  return Response.json({ report: scan.businessReport });
}

// POST /api/scans/:id/business-report — generate (once) a plain-language business-impact summary.
// Cached on the scan; replaceSourceFindings nulls the cache when findings change, so a later POST
// regenerates. Any Gemini failure degrades to the deterministic fallback.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });
  if (scan.businessReport) return Response.json({ report: scan.businessReport, cached: true });

  const findings = await getFindings(id);
  const { selected, omittedCount } = selectForReport(findings);
  const inputs: ReportInputs = {
    selected,
    omittedCount,
    checksCompletedCount: findings.filter((f) => f.confidence === 'no_issue').length,
  };

  try {
    const { report, model } = await generateBusinessReport(inputs, scan.orgContext);
    await saveBusinessReport(id, report, model);
    await audit(id, 'business_report_generated', {
      model, selectedCount: selected.length, totalCount: findings.length,
    });
    return Response.json({ report });
  } catch (error) {
    const report = fallbackBusinessReport(inputs);
    await saveBusinessReport(id, report, 'deterministic-fallback');
    await audit(id, 'business_report_fallback', { reason: String(error) });
    return Response.json({ report, warning: 'The AI summary was unavailable; a local summary was used.' });
  }
}
