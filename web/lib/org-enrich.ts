// Derives a short, plain-language profile of the scanned organization from its OWN authorized
// website, to give the business-impact report richer conditioning. Additive and fail-safe: every
// step returns null on any problem, so enrichment never blocks or breaks a report.
import { query, queryOne } from './db';
import { authorizeScan, normalizeDomain } from './net-guard';

const CACHE_TTL_HOURS = 720; // 30 days — an org's "about" text changes rarely
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

// Same relaxed safety posture as the report call: security vocabulary must not trip content filters.
const SAFETY = [
  'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

/** Strip scripts/styles/tags/entities from HTML and collapse to capped plain text. Pure. */
export function htmlToText(html: string, max = 4000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export interface EnrichDeps {
  authorize?: (domain: string) => Promise<{ ok: boolean }>;
  fetchText?: (url: string) => Promise<string | null>;
  summarize?: (text: string) => Promise<string | null>;
  cache?: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void> };
}

/**
 * Fetch + extract one page's text. Manual redirects: a 3xx is only followed one hop and only after
 * the redirect target re-passes the SSRF/allowlist gate (defends against redirect-based SSRF).
 */
async function fetchPageText(url: string, redirects = 1): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': 'SafetyRoutes/1.0 (report context)' },
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc || redirects <= 0) return null;
      const next = new URL(loc, url).toString();
      const gate = await authorizeScan(normalizeDomain(next));
      if (!gate.ok) return null;
      return fetchPageText(next, redirects - 1);
    }
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') ?? '').includes('text/html')) return null;
    return htmlToText(await res.text());
  } catch {
    return null; // network/timeout/parse — enrichment degrades, never throws
  }
}

async function defaultSummarize(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const prompt = [
    'From the website text below, write 2-3 plain sentences describing what this organization does',
    'and who it serves. Use ONLY the text. Do not add marketing language, numbers, or any fact the',
    'text does not state. If the text is uninformative, say only what it supports.',
    '',
    '<website_text>',
    text,
    '</website_text>',
  ].join('\n');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
          safetySettings: SAFETY,
        }),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const out = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
    return out ? out.slice(0, 600) : null;
  } catch {
    return null;
  }
}

const defaultCache = {
  async get(key: string): Promise<string | null> {
    const row = await queryOne<{ response_json: unknown; fetched_at: string; ttl_hours: number }>(
      `SELECT response_json, fetched_at, ttl_hours FROM mitre_cache WHERE cache_key = $1`,
      [key],
    );
    if (!row) return null;
    const ageHours = (Date.now() - new Date(row.fetched_at).getTime()) / 3_600_000;
    if (ageHours > row.ttl_hours) return null;
    return typeof row.response_json === 'string' ? row.response_json : null;
  },
  async set(key: string, value: string): Promise<void> {
    await query(
      `INSERT INTO mitre_cache (cache_key, response_json, fetched_at, ttl_hours)
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT (cache_key) DO UPDATE
         SET response_json = EXCLUDED.response_json, fetched_at = now(), ttl_hours = EXCLUDED.ttl_hours`,
      [key, JSON.stringify(value), CACHE_TTL_HOURS],
    );
  },
};

/**
 * Derive a short plain-language profile of the org from its own authorized website (homepage +
 * /about). Cached per-domain. Returns null if there's no domain, it isn't authorized, nothing could
 * be fetched, or summarization fails — the report simply proceeds without the extra context.
 */
export async function deriveOrgProfile(domain: string | null, deps: EnrichDeps = {}): Promise<string | null> {
  if (!domain) return null;
  const d = normalizeDomain(domain);
  if (!d) return null;

  const cache = deps.cache ?? defaultCache;
  const key = `org:${d}`;
  const cached = await cache.get(key).catch(() => null);
  if (cached) return cached;

  const authorize = deps.authorize ?? authorizeScan;
  if (!(await authorize(d)).ok) return null;

  const fetchText = deps.fetchText ?? fetchPageText;
  const pages = await Promise.all([fetchText(`https://${d}/`), fetchText(`https://${d}/about`)]);
  const text = pages.filter(Boolean).join('\n\n').slice(0, 6000).trim();
  if (!text) return null;

  const summarize = deps.summarize ?? defaultSummarize;
  const summary = await summarize(text);
  if (!summary) return null;

  await cache.set(key, summary).catch(() => {});
  return summary;
}
