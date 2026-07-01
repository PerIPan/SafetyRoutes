import { describe, expect, test } from 'vitest';
import { selectForReport } from './report';
import type { Finding, FindingSource, FindingConfidence, FindingSeverity } from './types';

let seq = 0;
function mk(p: Partial<Finding> = {}): Finding {
  seq += 1;
  return {
    scanId: 's',
    source: (p.source ?? 'server') as FindingSource,
    confidence: (p.confidence ?? 'confirmed') as FindingConfidence,
    title: p.title ?? `finding-${seq}`,
    ...p,
  };
}

describe('selectForReport', () => {
  test('empty input yields no selection and zero omitted', () => {
    expect(selectForReport([])).toEqual({ selected: [], omittedCount: 0 });
  });

  test('orders findings by band: fix_now before plan before check before clear', () => {
    const clear = mk({ confidence: 'no_issue', title: 'clear' });
    const check = mk({ confidence: 'advisory', title: 'check' });
    const plan = mk({ confidence: 'confirmed', severity: 'low', title: 'plan' });
    const fixNow = mk({ confidence: 'confirmed', severity: 'critical', title: 'fixNow' });
    const { selected } = selectForReport([clear, check, plan, fixNow]);
    expect(selected.map((f) => f.title)).toEqual(['fixNow', 'plan', 'check', 'clear']);
  });

  test('within fix_now, actively-exploited (KEV) outranks non-KEV', () => {
    const high = mk({ confidence: 'confirmed', severity: 'high', title: 'high' });
    const kev = mk({ confidence: 'confirmed', severity: 'high', isKev: true, title: 'kev' });
    const { selected } = selectForReport([high, kev]);
    expect(selected.map((f) => f.title)).toEqual(['kev', 'high']);
  });

  test('dedupes on idempotencyKey, keeping the first occurrence', () => {
    const a = mk({ title: 'a', idempotencyKey: 'dup' });
    const b = mk({ title: 'b', idempotencyKey: 'dup' });
    const { selected, omittedCount } = selectForReport([a, b]);
    expect(selected).toHaveLength(1);
    expect(selected[0].title).toBe('a');
    expect(omittedCount).toBe(0); // a duplicate is not an "omitted lower-priority item"
  });

  test('caps at the limit and reports the remainder as omittedCount', () => {
    const findings = Array.from({ length: 25 }, (_, i) =>
      mk({ confidence: 'confirmed', severity: 'high', title: `f${i}`, idempotencyKey: `k${i}` }),
    );
    const { selected, omittedCount } = selectForReport(findings, 20);
    expect(selected).toHaveLength(20);
    expect(omittedCount).toBe(5);
  });

  test('per-source floor keeps a lower-band website finding that server CVEs would bury', () => {
    // 25 actively-exploited server CVEs (all fix_now) would fill every slot on rank alone.
    const serverCves = Array.from({ length: 25 }, (_, i) =>
      mk({ source: 'server', confidence: 'confirmed', severity: 'critical', isKev: true,
           title: `cve${i}`, idempotencyKey: `cve${i}` }),
    );
    // one confirmed-but-lower-urgency website finding (band 'plan').
    const websiteHole = mk({ source: 'website', confidence: 'confirmed', severity: 'low',
                             title: 'website-hole', idempotencyKey: 'web1' });
    const { selected } = selectForReport([...serverCves, websiteHole], 20);
    expect(selected.map((f) => f.title)).toContain('website-hole');
  });
});
