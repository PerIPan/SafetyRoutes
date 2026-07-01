import type { BusinessReport, Finding } from './types';
import { bandOf } from './report';

const clean = (value: unknown, max = 1200) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';

export function fallbackBusinessReport(findings: Finding[]): BusinessReport {
  const actionable = findings.filter((f) => f.confidence !== 'no_issue');
  const urgent = actionable.filter((f) => bandOf(f) === 'fix_now');
  const actions = actionable.slice(0, 3).map((f) => clean(f.fixText) || `Review and address: ${clean(f.title)}`);
  return {
    headline: urgent.length ? `${urgent.length} urgent security action${urgent.length === 1 ? '' : 's'}` : 'No urgent action detected',
    overview: actionable.length
      ? `The check found ${actionable.length} item${actionable.length === 1 ? '' : 's'} that may affect service continuity, data protection, or public trust. Start with the actions below.`
      : 'The completed checks did not identify a known issue. This is a point-in-time result, so normal updates and monitoring should continue.',
    actions: actions.length ? actions : ['Keep systems updated and repeat the check after significant changes.'],
    positive: `${findings.filter((f) => f.confidence === 'no_issue').length} check${findings.filter((f) => f.confidence === 'no_issue').length === 1 ? '' : 's'} completed without a known issue.`,
    generatedBy: 'fallback',
  };
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  return JSON.parse(fenced.slice(fenced.indexOf('{'), fenced.lastIndexOf('}') + 1));
}

export async function generateBusinessReport(findings: Finding[]): Promise<{ report: BusinessReport; model: string }> {
  const fallback = fallbackBusinessReport(findings);
  const base = process.env.OLLAMA_BASE_URL?.replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  if (!base) return { report: fallback, model: 'deterministic-fallback' };

  const evidence = findings.slice(0, 60).map((f) => ({
    title: clean(f.title, 180), confidence: f.confidence, severity: f.severity,
    activelyExploited: !!f.isKev, explanation: clean(f.plainExplanation, 400),
    recommendedFix: clean(f.fixText, 300),
  }));
  const response = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model, stream: false, format: 'json',
      prompt: `You write concise cybersecurity reports for small-business leaders. Use only the evidence supplied. Do not invent losses, exposure, compliance duties, or completed checks. Avoid CVSS jargon. Return JSON with exactly: headline (string), overview (string), actions (array of 1-4 short strings), positive (string).\nEvidence:\n${JSON.stringify(evidence)}`,
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const payload = await response.json() as { response?: string };
  const parsed = parseJson(payload.response ?? '') as Record<string, unknown>;
  const actions = Array.isArray(parsed.actions) ? parsed.actions.map((x) => clean(x, 300)).filter(Boolean).slice(0, 4) : [];
  const report: BusinessReport = {
    headline: clean(parsed.headline, 160) || fallback.headline,
    overview: clean(parsed.overview) || fallback.overview,
    actions: actions.length ? actions : fallback.actions,
    positive: clean(parsed.positive, 500) || fallback.positive,
    generatedBy: 'ollama',
  };
  return { report, model };
}
