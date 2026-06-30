import { searchApplications } from '@/lib/mitre';

// GET /api/applications/search?q=... — type-ahead proxy to mitre-explorer Applications
// (server-side: avoids CORS and reuses the mitre_cache).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return Response.json({ items: await searchApplications(q) });
}
