import { describe, expect, test, vi } from 'vitest';
import { fallbackBusinessReport, generateBusinessReport } from './business-report';
import type { ReportInputs } from './business-report';
import type { Finding } from './types';

let seq = 0;
function fnd(p: Partial<Finding> = {}): Finding {
  seq += 1;
  return {
    scanId: 's',
    source: p.source ?? 'website',
    confidence: p.confidence ?? 'confirmed',
    title: p.title ?? `finding-${seq}`,
    ...p,
  };
}
function inputs(selected: Finding[], extra: Partial<ReportInputs> = {}): ReportInputs {
  return { selected, omittedCount: 0, checksCompletedCount: 0, ...extra };
}

// a canned Gemini "generateContent" response wrapping a JSON body
function gemini(body: unknown, finishReason = 'STOP') {
  return { candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(body) }] } }] };
}
const GOOD_BODY = {
  headline: 'One issue needs attention',
  overview: 'A backup file is publicly reachable on your website.',
  impacts: [{ evidenceIds: ['f1'], statement: 'Private files could be exposed to anyone.' }],
  actions: ['Move backups out of the public web folder.'],
  positive: 'No actively-exploited issues were detected.',
};
const ACTIONABLE = [fnd({ confidence: 'confirmed', severity: 'high', title: 'Exposed backup' })];

describe('fallbackBusinessReport', () => {
  test('headline counts urgent (fix_now) findings; actions come in band order', () => {
    const selected = [
      fnd({ confidence: 'confirmed', severity: 'critical', title: 'RCE', fixText: 'Patch now' }),
      fnd({ confidence: 'confirmed', severity: 'low', title: 'Cookie flag', fixText: 'Set Secure' }),
      fnd({ confidence: 'no_issue', title: 'TLS ok' }),
    ];
    const r = fallbackBusinessReport(inputs(selected, { omittedCount: 3, checksCompletedCount: 5 }));
    expect(r.generatedBy).toBe('fallback');
    expect(r.headline).toBe('1 urgent security action');
    expect(r.actions[0]).toBe('Patch now');            // band-ordered, not input order
    expect(r.positive).toContain('5');                  // checksCompletedCount, not selected count
    expect(r.overview).toContain('3');                  // omittedCount disclosed
  });

  test('no actionable findings yields a reassuring, non-urgent report', () => {
    const r = fallbackBusinessReport(inputs([fnd({ confidence: 'no_issue', title: 'ok' })],
      { checksCompletedCount: 1 }));
    expect(r.headline).toBe('No urgent action detected');
    expect(r.actions.length).toBeGreaterThan(0);
  });
});

describe('generateBusinessReport', () => {
  test('happy path: shapes a valid Gemini report and marks provenance', async () => {
    const { report, model } = await generateBusinessReport(
      inputs(ACTIONABLE), null, { call: async () => gemini(GOOD_BODY) });
    expect(report.generatedBy).toBe('gemini');
    expect(report.headline).toBe('One issue needs attention');
    expect(report.impacts[0].statement).toContain('exposed');
    expect(model).toBe('gemini-flash-latest');
  });

  test('no actionable findings short-circuits without calling the model', async () => {
    const call = vi.fn();
    const { report } = await generateBusinessReport(
      inputs([fnd({ confidence: 'no_issue' })], { checksCompletedCount: 1 }), null, { call });
    expect(call).not.toHaveBeenCalled();
    expect(report.generatedBy).toBe('fallback');
  });

  test('SAFETY finishReason throws (so the route falls back)', async () => {
    await expect(generateBusinessReport(inputs(ACTIONABLE), null,
      { call: async () => ({ candidates: [{ finishReason: 'SAFETY' }] }) })).rejects.toThrow();
  });

  test('blocked prompt (no candidates) throws', async () => {
    await expect(generateBusinessReport(inputs(ACTIONABLE), null,
      { call: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) })).rejects.toThrow();
  });

  test('malformed JSON throws', async () => {
    await expect(generateBusinessReport(inputs(ACTIONABLE), null,
      { call: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }) }))
      .rejects.toThrow();
  });

  test('invented numbers/losses are rejected (drops to fallback via throw)', async () => {
    const bad = { ...GOOD_BODY, overview: 'This could cost you $5,000 in losses.' };
    await expect(generateBusinessReport(inputs(ACTIONABLE), null,
      { call: async () => gemini(bad) })).rejects.toThrow();
  });

  test('impacts referencing a non-existent evidence id are dropped', async () => {
    const body = { ...GOOD_BODY, impacts: [
      { evidenceIds: ['f9'], statement: 'dangling and should be dropped' },
      { evidenceIds: ['f1'], statement: 'grounded and kept' },
    ] };
    const { report } = await generateBusinessReport(inputs(ACTIONABLE), null,
      { call: async () => gemini(body) });
    expect(report.impacts).toHaveLength(1);
    expect(report.impacts[0].statement).toBe('grounded and kept');
  });

  test('the grounded counts the prompt mandates are NOT treated as fabricated', async () => {
    // checksCompletedCount/omittedCount appear in prose but never in the evidence JSON.
    const body = {
      ...GOOD_BODY,
      overview: 'A backup file is exposed; 130 more lower-priority items also exist.',
      positive: '147 checks completed without a known issue.',
    };
    const { report } = await generateBusinessReport(
      inputs(ACTIONABLE, { omittedCount: 130, checksCompletedCount: 147 }), null,
      { call: async () => gemini(body) });
    expect(report.generatedBy).toBe('gemini');
    expect(report.positive).toContain('147');
  });

  test('fabricated entity counts and spelled magnitudes are rejected', async () => {
    const withCount = { ...GOOD_BODY, impacts: [{ evidenceIds: ['f1'], statement: 'Could expose 50 donor records.' }] };
    await expect(generateBusinessReport(inputs(ACTIONABLE), null, { call: async () => gemini(withCount) }))
      .rejects.toThrow();
    const withMagnitude = { ...GOOD_BODY, overview: 'A breach could cost your clinic twelve million in recovery.' };
    await expect(generateBusinessReport(inputs(ACTIONABLE), null, { call: async () => gemini(withMagnitude) }))
      .rejects.toThrow();
  });

  test('MAX_TOKENS with a parseable body still yields a report', async () => {
    const { report } = await generateBusinessReport(inputs(ACTIONABLE), null,
      { call: async () => gemini(GOOD_BODY, 'MAX_TOKENS') });
    expect(report.generatedBy).toBe('gemini');
  });

  test('when every impact has a dangling id, impacts fall back (never silently empty)', async () => {
    const body = { ...GOOD_BODY, impacts: [{ evidenceIds: ['f9'], statement: 'dangling' }] };
    const { report } = await generateBusinessReport(inputs(ACTIONABLE), null,
      { call: async () => gemini(body) });
    expect(report.impacts.length).toBeGreaterThan(0);
  });

  test('records the resolved model version from the response, not the -latest alias', async () => {
    const raw = { ...gemini(GOOD_BODY), modelVersion: 'gemini-3.5-flash' };
    const { model } = await generateBusinessReport(inputs(ACTIONABLE), null, { call: async () => raw });
    expect(model).toBe('gemini-3.5-flash');
  });
});
