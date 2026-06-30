import { createScan } from '@/lib/scans';

// POST /api/scans — create a scan + record consent. Sources are optional (1–3).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = await createScan({
    domain: typeof body.domain === 'string' ? body.domain.trim() : null,
    consentBy: typeof body.consentBy === 'string' ? body.consentBy : null,
    ownershipVerified: !!body.ownershipVerified,
    ownershipMethod: typeof body.ownershipMethod === 'string' ? body.ownershipMethod : null,
    profile: typeof body.profile === 'string' ? body.profile : null,
  });
  return Response.json({ id }, { status: 201 });
}
