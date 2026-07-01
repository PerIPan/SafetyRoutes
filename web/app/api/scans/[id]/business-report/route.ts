import { getFindings } from '@/lib/findings';
import { fallbackBusinessReport, generateBusinessReport } from '@/lib/business-report';
import { audit, getScan, saveBusinessReport } from '@/lib/scans';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const scan = await getScan((await ctx.params).id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });
  return Response.json({ report: scan.businessReport });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: 'Scan not found' }, { status: 404 });
  if (scan.businessReport) return Response.json({ report: scan.businessReport, cached: true });
  const findings = await getFindings(id);
  try {
    const { report, model } = await generateBusinessReport(findings);
    await saveBusinessReport(id, report, model);
    await audit(id, 'business_report_generated', { model, findingCount: findings.length });
    return Response.json({ report });
  } catch (error) {
    const report = fallbackBusinessReport(findings);
    const model = 'deterministic-fallback';
    await saveBusinessReport(id, report, model);
    await audit(id, 'business_report_fallback', { reason: String(error) });
    return Response.json({ report, warning: 'Ollama was unavailable; a local fallback was used.' });
  }
}
