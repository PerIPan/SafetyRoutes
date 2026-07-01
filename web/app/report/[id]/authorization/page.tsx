import Link from "next/link";
import { notFound } from "next/navigation";
import { getScan } from "@/lib/scans";
import { Brand } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function AuthorizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan?.authorization) notFound();
  const a = scan.authorization;
  return (
    <main className="mx-auto max-w-3xl bg-white px-10 py-12 text-ink print:max-w-none">
      <div className="mb-10 flex items-start justify-between">
        <Brand />
        <div className="text-right font-mono text-[11px] text-muted">
          <div>Authorization {a.authorizationId}</div>
          <div>{new Date(a.acceptedAt).toLocaleString()}</div>
        </div>
      </div>
      <h1 className="font-display text-[30px] font-semibold">Website security-check authorization</h1>
      <p className="mt-3 leading-relaxed text-ink-soft">
        This document records the permission supplied to SafetyRoutes for a limited, read-only
        security check. It is generated automatically from the authorization accepted in the wizard.
      </p>
      <dl className="my-8 grid grid-cols-[190px_1fr] border-y border-line text-[14px]">
        {[
          ["Organization", a.organizationName],
          ["Authorized representative", a.authorizedBy],
          ["Contact", a.contactEmail || "Not supplied"],
          ["Authorized target", a.domain || "No website target"],
          ["Check depth", a.profile],
          ["Scan reference", id],
        ].map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="border-b border-line bg-paper px-3 py-2 font-semibold">{label}</dt>
            <dd className="border-b border-line px-3 py-2">{value}</dd>
          </div>
        ))}
      </dl>
      <h2 className="font-display text-xl font-semibold">Authorized activity</h2>
      <p className="mt-2 leading-relaxed text-ink-soft">
        SafetyRoutes may perform the selected low-impact website checks against the named target,
        collect technical observations, and prepare a private report. Authorization does not include
        denial-of-service testing, password attacks, exploitation, persistence, social engineering,
        or scanning other domains and subdomains.
      </p>
      <p className="mt-2 leading-relaxed text-ink-soft">
        To produce the plain-language summary in the report, the findings, any organization details
        provided, and a short summary of the target website&apos;s public pages are sent to Google
        Gemini, a third-party AI service.
      </p>
      <h2 className="mt-6 font-display text-xl font-semibold">Acknowledgement</h2>
      <p className="mt-2 leading-relaxed text-ink-soft">
        By accepting the wizard statement, {a.authorizedBy} represented that they own the target or
        hold written authority to approve this check. Authorization may be withdrawn before or during
        a scan by contacting the operator.
      </p>
      <div className="mt-12 grid grid-cols-2 gap-12 text-[13px]">
        <div className="border-t border-ink pt-2">Authorized representative: {a.authorizedBy}</div>
        <div className="border-t border-ink pt-2">
          Recorded electronically: {new Date(a.acceptedAt).toLocaleDateString()}
        </div>
      </div>
      <div className="mt-10 flex gap-3 print:hidden">
        <PrintButton />
        <Link
          href={`/report/${id}`}
          className="rounded-xl border border-line px-5 py-3 font-semibold"
        >
          Back to report
        </Link>
      </div>
    </main>
  );
}
