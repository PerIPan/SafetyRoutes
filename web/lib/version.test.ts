import { describe, it, expect } from 'vitest';
import { compareVersions, satisfiesRange, isVersionAffected } from './version';

describe('compareVersions', () => {
  it('orders numeric segments numerically, not lexically', () => {
    // the README gotcha: 2.5 must be LESS than 12.5.1
    expect(compareVersions('2.5', '12.5.1')).toBe(-1);
    expect(compareVersions('12.5.1', '2.5')).toBe(1);
    expect(compareVersions('2.5', '2.50')).toBe(-1);
  });
  it('pads missing segments with zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('6.1', '6.1.0')).toBe(0);
  });
  it('handles alpha suffixes (e.g. openssl 1.1.1n)', () => {
    expect(compareVersions('1.1.1n', '1.1.1')).toBe(1);
    expect(compareVersions('1.1.1', '1.1.1n')).toBe(-1);
  });
  it('equal versions', () => {
    expect(compareVersions('3.2.18', '3.2.18')).toBe(0);
    expect(compareVersions('v6.1', '6.1')).toBe(0);
  });
});

describe('satisfiesRange', () => {
  it('checks compound GHSA ranges', () => {
    expect(satisfiesRange('4.17.20', '>= 4.0.0, < 4.18.0')).toBe(true);
    expect(satisfiesRange('4.18.0', '>= 4.0.0, < 4.18.0')).toBe(false); // upper exclusive
    expect(satisfiesRange('3.9.9', '>= 4.0.0, < 4.18.0')).toBe(false); // below lower
  });
  it('single comparator', () => {
    expect(satisfiesRange('6.1', '< 6.5')).toBe(true);
    expect(satisfiesRange('6.5', '< 6.5')).toBe(false);
  });
  it('returns null for an unparseable range', () => {
    expect(satisfiesRange('1.0', '')).toBeNull();
  });
  it('returns null for a bare version with no operator (ambiguous, not equality)', () => {
    expect(satisfiesRange('5.0', '1.0')).toBeNull();
    expect(satisfiesRange('1.0', '1.0')).toBeNull();
  });
});

describe('isVersionAffected', () => {
  it('prefers an explicit vulnerable range', () => {
    expect(isVersionAffected('4.17.20', { range: '>= 4.0.0, < 4.18.0' })).toBe('affected');
    expect(isVersionAffected('4.18.0', { range: '>= 4.0.0, < 4.18.0' })).toBe('not_affected');
  });
  it('uses fixed version when no range', () => {
    expect(isVersionAffected('6.1', { fixed: '6.5' })).toBe('affected');
    expect(isVersionAffected('6.5', { fixed: '6.5' })).toBe('not_affected');
  });
  it('uses start/end bounds (best-effort, inclusive)', () => {
    expect(isVersionAffected('2.0', { start: '1.0', end: '3.0' })).toBe('affected');
    expect(isVersionAffected('0.9', { start: '1.0', end: '3.0' })).toBe('not_affected');
    expect(isVersionAffected('3.1', { start: '1.0', end: '3.0' })).toBe('not_affected');
  });
  it('returns unknown when version missing or no constraints — never guesses confirmed', () => {
    expect(isVersionAffected(null, { fixed: '6.5' })).toBe('unknown');
    expect(isVersionAffected('', { fixed: '6.5' })).toBe('unknown');
    expect(isVersionAffected('6.1', {})).toBe('unknown');
  });
});
