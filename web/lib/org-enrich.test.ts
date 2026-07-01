import { describe, expect, test, vi } from 'vitest';
import { htmlToText, deriveOrgProfile } from './org-enrich';

describe('htmlToText', () => {
  test('strips scripts, styles and tags and collapses whitespace', () => {
    const html = `<html><head><style>.a{color:red}</style><script>evil()</script></head>
      <body><h1>Riverside   Clinic</h1><p>We serve   patients.</p></body></html>`;
    expect(htmlToText(html)).toBe('Riverside Clinic We serve patients.');
  });

  test('caps length', () => {
    expect(htmlToText('<p>' + 'x'.repeat(5000) + '</p>', 100)).toHaveLength(100);
  });

  test('markup-only content yields an empty string', () => {
    expect(htmlToText('<script>only()</script>')).toBe('');
  });
});

describe('deriveOrgProfile', () => {
  const okAuth = async () => ({ ok: true });
  const noCache = { get: async () => null, set: async () => {} };

  test('returns null for a missing domain without touching the network', async () => {
    const fetchText = vi.fn();
    expect(await deriveOrgProfile(null, { fetchText })).toBeNull();
    expect(fetchText).not.toHaveBeenCalled();
  });

  test('returns a cached profile without fetching or summarizing', async () => {
    const fetchText = vi.fn();
    const summarize = vi.fn();
    const out = await deriveOrgProfile('example.org', {
      authorize: okAuth, fetchText, summarize,
      cache: { get: async () => 'cached profile', set: vi.fn() },
    });
    expect(out).toBe('cached profile');
    expect(fetchText).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
  });

  test('returns null when the domain is not authorized (no fetch)', async () => {
    const fetchText = vi.fn();
    const out = await deriveOrgProfile('evil.internal', {
      authorize: async () => ({ ok: false }), fetchText, cache: noCache,
    });
    expect(out).toBeNull();
    expect(fetchText).not.toHaveBeenCalled();
  });

  test('returns null when no page text could be fetched (no summarize)', async () => {
    const summarize = vi.fn();
    const out = await deriveOrgProfile('example.org', {
      authorize: okAuth, fetchText: async () => null, summarize, cache: noCache,
    });
    expect(out).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
  });

  test('fetches homepage + /about, summarizes, and caches on the happy path', async () => {
    const set = vi.fn(async () => {});
    const fetchText = vi.fn(async (url: string) =>
      url.includes('/about') ? 'About us: we help local donors.' : 'Home: a community clinic.');
    const out = await deriveOrgProfile('example.org', {
      authorize: okAuth, fetchText, cache: { get: async () => null, set },
      summarize: async (text: string) => `SUMMARY(${text.length})`,
    });
    expect(out).toMatch(/^SUMMARY\(/);
    expect(fetchText).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledOnce();
  });
});
