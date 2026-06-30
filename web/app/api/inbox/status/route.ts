import { getOrgIngestToken, getInboxReport } from '@/lib/inbox';

// GET /api/inbox/status
// Feeds the wizard's Server step + "Connect your server" setup panel. Returns the org's standing
// ingest token (so the collector can be installed once) and whether a fresh Trivy report is already
// waiting in the inbox.
//
// POC trust model: the token is returned to a same-origin, unauthenticated LOCAL UI — possession of
// localhost is the capability, consistent with the rest of the app. Before any multi-tenant / public
// deployment, gate this behind real auth and never ship the raw token to the browser.
export async function GET(req: Request) {
  // Defense-in-depth: this hands back a standing secret, so refuse cross-site requests. A malicious
  // remote page can issue a no-cors GET to localhost; it can't READ the JSON cross-origin, but we
  // reject it outright anyway and forbid caching so the token is never stored by an intermediary.
  const sfs = req.headers.get('sec-fetch-site');
  if (sfs && sfs !== 'same-origin' && sfs !== 'none') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { orgId, token } = await getOrgIngestToken();
  const latest = await getInboxReport(orgId);
  const origin = new URL(req.url).origin;

  return Response.json(
    {
      token,
      endpoint: `${origin}/api/ingest/trivy`,
      waiting: !!latest,
      latest: latest
        ? {
            receivedAt: latest.receivedAt,
            sourceHost: latest.sourceHost,
            resultCount: latest.resultCount,
            vulnCount: latest.vulnCount,
            sha256: latest.sha256,
          }
        : null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
