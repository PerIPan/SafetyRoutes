import { describe, expect, it } from 'vitest';
import { fallbackBusinessReport } from './business-report';

describe('fallbackBusinessReport', () => {
  it('turns findings into a business summary without an LLM', () => {
    const report = fallbackBusinessReport([{
      scanId: 'x', source: 'website', confidence: 'confirmed', severity: 'high',
      title: 'Outdated service', fixText: 'Apply the vendor update.',
    }]);
    expect(report.headline).toContain('urgent');
    expect(report.actions).toEqual(['Apply the vendor update.']);
    expect(report.generatedBy).toBe('fallback');
  });
});
