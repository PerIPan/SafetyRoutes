import Link from "next/link";
import { Brand } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Brand />
      <p className="mt-12 font-mono text-[12px] uppercase tracking-[0.14em] text-route-deep">
        A guided security check for community organizations
      </p>
      <h1 className="mt-3 max-w-[18ch] font-display text-[42px] font-semibold leading-[1.05] tracking-tight text-ink">
        A friendly health check-up for your organization.
      </h1>
      <p className="mt-5 max-w-[58ch] text-[16px] leading-relaxed text-ink-soft">
        SafetyRoutes checks three things and explains what it finds in plain language: your{" "}
        <b>website</b>, the <b>packages</b> on your servers, and any <b>other software</b> you
        tell us about. We only ever check organizations that have asked us to.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/new"
          className="rounded-xl bg-route px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_22px_-12px_rgba(14,156,165,0.8)]"
        >
          Start a check →
        </Link>
        <Link
          href="/demo"
          className="rounded-xl border border-line bg-surface px-6 py-3.5 text-[15px] font-semibold text-ink-soft"
        >
          See a sample report
        </Link>
        <Link href="/test-site" className="px-3 py-3.5 text-[14px] font-semibold text-route-deep underline">
          Try the safe test site
        </Link>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            ["🌐", "Website", "Artemis + Nuclei scan your domain — apps, exposed files, email hygiene.", "Confirmed"],
            ["📦", "Server packages", "Upload a Trivy report — vulnerable OS & library packages.", "Confirmed"],
            ["💻", "Other software", "Tell us product + version — we list the known issues to check.", "Advisory"],
          ] as const
        ).map(([icon, title, body, conf]) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-5">
            <div className="text-2xl">{icon}</div>
            <div className="mt-2 font-display text-[17px] font-semibold text-ink">{title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{body}</p>
            <div className="mt-2 font-mono text-[11px] text-route-deep">{conf}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
