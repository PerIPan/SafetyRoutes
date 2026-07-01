import { createScan } from '@/lib/scans';

// POST /api/scans — create a scan + record consent. Sources are optional (1–3).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const id = await createScan({
    domain: typeof body.domain === 'string' ? body.domain.trim() : null,
    consentBy: str(body.consentBy),
    ownershipVerified: !!body.ownershipVerified,
    ownershipMethod: str(body.ownershipMethod),
    profile: str(body.profile),
    organizationName: str(body.organizationName),
    contactEmail: str(body.contactEmail),
    whatOrgDoes: str(body.whatOrgDoes),
    whoWeServe: str(body.whoWeServe),
    sensitiveData: str(body.sensitiveData),
  });
  return Response.json({ id }, { status: 201 });
}
