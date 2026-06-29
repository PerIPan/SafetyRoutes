import Link from "next/link";
import { notFound } from "next/navigation";
import { getScan } from "@/lib/scans";
import { getFindings } from "@/lib/findings";
import { buildReport } from "@/lib/report";
import { Brand, SourceChip, ConfidencePill } from "@/components/ui";
import type { Finding } from "@/lib/types";

export const dynamic = "force-dynamic";

function SummaryCard({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <span className="font-display text-[26px] font-bold leading-none" style={{ color }}>
        {n}
      </span>
      <span className="max-w-[12ch] text-[12px] leading-tight text-muted">{label}</span>
    </div>
  );
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <div className="flex items-start gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <SourceChip source={f.source} />
      <ConfidencePill confidence={f.confidence} />
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold text-ink">{f.title}</div>
        {f.plainExplanation && (
          <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {f.plainExplanation}{" "}
            {f.fixText && <span className="font-semibold text-ink">Fix: {f.fixText}</span>}
          </div>
        )}
        <div className="mt-1.5 font-mono text-[10.5px] text-muted">
          {[
            f.severityPlain,
            f.cveId,
            f.module,
            f.purl,
            f.enrichmentStatus === "unavailable" ? "enrichment: n/a" : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </div>
      </div>
    </div>
  );
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) notFound();
  const { summary, findings } = buildReport(await getFindings(id));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Brand />
        <span className="inline-flex items-center gap-2 rounded-full border border-[#C2E1DF] bg-[#E2F1F0] px-3 py-1.5 font-mono text-[11px] text-route-deep">
          <span className="h-[7px] w-[7px] rounded-full bg-route" />
          {scan.domain ?? "your organization"}
        </span>
      </div>

      <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.14em] text-route-deep">
        Your report
      </p>
      <h1 className="mb-6 font-display text-[34px] font-semibold leading-tight tracking-tight text-ink">
        Here&apos;s what we found.
      </h1>

      <div className="mb-6 flex flex-wrap gap-3">
        <SummaryCard n={summary.confirmed} label="Confirmed — fix these" color="#C0492E" />
        <SummaryCard n={summary.advisory} label="Advisory — verify" color="#D9952F" />
        <SummaryCard n={summary.noIssue} label="Checked, looking good" color="#1F7A5A" />
      </div>

      {findings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-muted">
          No findings yet. Run a check from the{" "}
          <Link href="/new" className="text-route-deep underline">
            wizard
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {findings.map((f) => (
            <FindingCard key={f.id} f={f} />
          ))}
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Link
          href="/new"
          className="rounded-xl bg-route px-5 py-3 text-[14.5px] font-semibold text-white"
        >
          Run another check
        </Link>
      </div>
    </main>
  );
}
