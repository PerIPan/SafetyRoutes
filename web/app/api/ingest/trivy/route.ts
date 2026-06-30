import { verifyIngestToken, putInboxReport, sanitizeSourceHost, countTrivy } from '@/lib/inbox';
import { looksLikeTrivy } from '@/lib/trivy';
import { rateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/scans';

const MAX_BYTES = 8_000_000; // ≤8 MB raw body (matches the manual upload route)
const MAX_RESULTS = 5_000; // structural caps — reject (don't truncate) so Phase-2 enrichment can't blow up
const MAX_VULNS = 50_000;

const UNAUTHORIZED = () => Response.json({ error: 'Unauthorized' }, { status: 401 });

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0]!.trim() : '') || req.headers.get('x-real-ip') || 'local';
}

// POST /api/ingest/trivy — the host-side collector PUSHES a Trivy JSON report so it's "waiting" when
// a user later runs the wizard. Authenticated by a standing per-org token in `Authorization: Bearer`.
//
// Order is deliberately FAIL-CLOSED (security review): verify token FIRST (before reading the body),
// then rate-limit, then size-cap, then read/parse/validate, then store. No DB write happens on any
// path lacking a verified token. The token is NEVER accepted from the query string (it would leak via
// access logs / Referer / `ps`). See docs/trivy-auto-collect-todo.md.
export async function POST(req: Request) {
  const url = new URL(req.url);

  // 1. Reject query-string tokens outright — header-only.
  if (url.searchParams.has('token') || url.searchParams.has('org_token')) {
    return Response.json(
      { error: 'Send the token in the Authorization header (Bearer …), not the URL.' },
      { status: 400 },
    );
  }

  // 2. Verify Bearer token → orgId (constant-time). Generic 401 for absent/wrong/malformed.
  const auth = req.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  const orgId = await verifyIngestToken(bearer);
  if (!orgId) return UNAUTHORIZED();

  // 3. Rate limit per-token AND per-IP → 429.
  const ip = clientIp(req);
  const limits: Array<[string, number]> = [
    [`ingest:org:${orgId}`, 6],
    [`ingest:ip:${ip}`, 30],
  ];
  for (const [key, limit] of limits) {
    const rl = rateLimit(key, limit, 60_000);
    if (!rl.ok) {
      return Response.json(
        { error: 'Too many requests — try again shortly.' },
        { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
      );
    }
  }

  // 4. Reject content encodings — the byte cap must apply to real bytes (zip-bomb guard).
  const enc = (req.headers.get('content-encoding') ?? '').trim().toLowerCase();
  if (enc && enc !== 'identity') {
    return Response.json(
      { error: 'Content-Encoding not supported — send plain (identity) JSON.' },
      { status: 415 },
    );
  }

  // 5. Size cap BEFORE buffering, when Content-Length is present.
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return Response.json({ error: 'Report too large (max 8 MB).' }, { status: 413 });
  }

  // 6. Read + re-check the actual byte length.
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BYTES) {
    return Response.json({ error: 'Report too large (max 8 MB).' }, { status: 413 });
  }

  // 7. Parse + validate. For the inbox we REQUIRE a real Results[] array (reject null /
  //    SchemaVersion-only) so a crafted empty report can't masquerade as an authoritative all-clear
  //    that the wizard later adopts (security review P0-1).
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!looksLikeTrivy(json) || !Array.isArray((json as { Results?: unknown }).Results)) {
    return Response.json(
      { error: "This doesn't look like a Trivy JSON report (needs a Results[] array)." },
      { status: 400 },
    );
  }
  const { resultCount, vulnCount } = countTrivy(json);
  if (resultCount > MAX_RESULTS || vulnCount > MAX_VULNS) {
    return Response.json({ error: 'Report has too many entries to ingest.' }, { status: 413 });
  }

  // 8. Store (append-only) + audit. source_host is untrusted → sanitized.
  const sourceHost = sanitizeSourceHost(req.headers.get('x-source-host'));
  const report = await putInboxReport({ orgId, sourceHost, json, text });
  await audit(null, 'inbox.received', {
    orgId,
    sourceHost,
    sha256: report.sha256,
    bytes: report.bytes,
    resultCount,
    vulnCount,
  });

  return Response.json({
    ok: true,
    receivedAt: report.receivedAt,
    resultCount,
    vulnCount,
    sha256: report.sha256,
  });
}
