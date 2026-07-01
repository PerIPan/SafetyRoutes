import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getScan } from "@/lib/scans";
import { getFindings } from "@/lib/findings";
import { buildReport } from "@/lib/report";
import { Brand } from "@/components/ui";
import { ScanLive } from "@/components/scan-live";
import { BusinessSummary } from "@/components/business-summary";
import { FindingsView } from "@/components/findings-view";
import { ReportActions } from "@/components/report-actions";
import { ServerCheck } from "@/components/server-check";
import { CdnHelp } from "@/components/cdn-help";

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

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) notFound();
  const { summary, findings } = buildReport(await getFindings(id));
  // A check is still in progress while any source is running/pending (matches ScanLive's isRunning).
  // Terminal states: done | skipped | timed_out | failed.
  const scanning = Object.values(scan.sourceStatus ?? {}).some(
    (v) => v && (v.status === "running" || v.status === "pending"),
  );
  // canonical origin for the Trivy one-liner (so it renders the real host, not a localhost flash)
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

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

      <ScanLive scanId={id} initial={scan.sourceStatus} />

      {!scanning && findings.length > 0 && (
        <BusinessSummary scanId={id} initial={scan.businessReport} />
      )}

      {summary.kevCount > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#E7C3B8] bg-[#FBEAE4] px-4 py-3.5">
          <span className="text-[18px] leading-none">⚑</span>
          <div className="text-[13.5px] leading-relaxed text-[#7A2E1C]">
            <b>
              {summary.kevCount} issue{summary.kevCount === 1 ? " is" : "s are"} being actively
              exploited right now.
            </b>{" "}
            Fix {summary.kevCount === 1 ? "it" : "these"} first — they&apos;re at the top under{" "}
            <b>Fix now</b>.
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-3">
        <SummaryCard n={summary.confirmed} label="Confirmed — fix these" color="#C0492E" />
        <SummaryCard n={summary.advisory} label="Needs a quick check" color="#D9952F" />
        <SummaryCard n={summary.noIssue} label="Checked, looking good" color="#1F7A5A" />
      </div>

      {findings.length === 0 ? (
        scanning ? (
          <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-muted">
            Your check is running — results will appear here automatically as they come in.
          </p>
        ) : (
          <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-muted">
            No findings yet. Run a check from the{" "}
            <Link href="/new" className="text-route-deep underline">
              wizard
            </Link>
            .
          </p>
        )
      ) : (
        <FindingsView findings={findings} />
      )}

      {findings.some(
        (f) => f.source === "website" && f.module === "artemis" && f.confidence === "advisory",
      ) && <CdnHelp />}

      <ServerCheck
        scanId={id}
        token={scan.uploadToken}
        hasServerFindings={findings.some((f) => f.source === "server")}
        origin={origin}
      />

      <ReportActions scanId={id} initial={scan.sourceStatus} />

      {scan.authorization && (
        <p className="mt-6 font-mono text-[11px] text-muted">
          <Link href={`/report/${id}/authorization`} className="text-route-deep underline">
            View the scan authorization record →
          </Link>
        </p>
      )}
    </main>
  );
}
