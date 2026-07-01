import Link from "next/link";
import { Brand } from "@/components/ui";

export default function TestSitePage() {
  return <main className="mx-auto max-w-3xl px-6 py-12">
    <Brand />
    <div className="mt-10 rounded-2xl border border-check bg-white p-8">
      <p className="font-mono text-xs uppercase tracking-widest text-check">Safe training target</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">SafetyRoutes built-in test site</h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        This deliberately harmless fixture demonstrates detection, prioritization, authorization,
        and reporting. It never sends scanning traffic to the internet and contains no exploitable service.
      </p>
      <div data-test-finding="exposed-backup" className="mt-6 rounded-xl bg-paper p-4 font-mono text-sm">
        Example artifact: archive.config.backup (synthetic; no file is served)
      </div>
      <Link href="/new?test=1" className="mt-6 inline-block rounded-xl bg-route px-5 py-3 font-semibold text-white">
        Run the safe test check
      </Link>
    </div>
  </main>;
}
