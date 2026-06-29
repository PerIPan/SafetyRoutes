"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/ui";

type SoftwareRow = { vendor: string; product: string; version: string };

const STEPS = ["Permission & site", "Server packages", "Other software", "Run the check"];

export default function NewScan() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [consentBy, setConsentBy] = useState("");
  const [consent, setConsent] = useState(false);
  const [trivyName, setTrivyName] = useState<string | null>(null);
  const [trivyText, setTrivyText] = useState<string | null>(null);
  const [rows, setRows] = useState<SoftwareRow[]>([
    { vendor: "", product: "", version: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canStart = domain.trim().length > 0 && consent;

  async function onTrivyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrivyName(file.name);
    setTrivyText(await file.text());
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const scanRes = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          consentBy: consentBy.trim() || null,
          ownershipVerified: true,
          ownershipMethod: "owner-allowlist",
        }),
      });
      const { id } = await scanRes.json();

      if (trivyText) {
        const up = await fetch(`/api/scans/${id}/trivy-upload?filename=${encodeURIComponent(trivyName ?? "report.json")}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: trivyText,
        });
        if (!up.ok) throw new Error((await up.json()).error ?? "Trivy upload failed");
      }

      const software = rows.filter((r) => r.product.trim() && r.version.trim());
      if (software.length) {
        await fetch(`/api/scans/${id}/declared-software`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: software }),
        });
      }

      router.push(`/report/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-[280px_1fr]">
      {/* route rail */}
      <aside className="flex flex-col bg-ink px-6 py-8 text-[#EAF2F1]">
        <Brand />
        <ol className="mt-9 flex-1 space-y-1">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-start gap-3.5 py-2.5">
              <span
                className={`mt-0.5 grid h-5 w-5 place-items-center rounded-full border-2 text-[11px] font-bold ${
                  i < step
                    ? "border-route bg-route text-ink"
                    : i === step
                      ? "border-route bg-ink text-route ring-4 ring-route/20"
                      : "border-[#3A5763] bg-ink text-[#3A5763]"
                }`}
              >
                {i < step ? "✓" : ""}
              </span>
              <div>
                <div className="font-mono text-[10px] tracking-[0.1em] text-[#6E929A]">
                  S{i + 1}
                </div>
                <div
                  className={`text-[14px] ${i === step ? "font-semibold text-white" : "text-[#A7C2C4]"}`}
                >
                  {label}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="border-t border-[#2C4A57] pt-3 font-mono text-[10px] text-[#6E929A]">
          Artemis · Trivy · MITRE&nbsp;Explorer
        </div>
      </aside>

      {/* main */}
      <main className="flex flex-col px-12 py-10">
        <div className="font-mono text-[12px] text-muted">
          Step {step + 1} of {STEPS.length}
        </div>

        {step === 0 && (
          <Section
            eyebrow="Permission & site"
            title="Let's check your organization."
            lede="Enter the website we should check. The website scan is read-only and only ever runs against sites you're authorized to test."
          >
            <Field label="Your website address">
              <div className="flex items-center gap-2 rounded-xl border-2 border-route bg-[#FBFDFC] px-4 py-3 shadow-[0_0_0_4px_rgba(14,156,165,0.14)]">
                <span className="font-mono text-[13px] text-muted">https://</span>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="yourcharity.org"
                  className="w-full bg-transparent text-[15px] text-ink outline-none"
                />
              </div>
            </Field>
            <Field label="Your name (optional — recorded with consent)">
              <input
                value={consentBy}
                onChange={(e) => setConsentBy(e.target.value)}
                placeholder="Jane Doe"
                className="w-full max-w-[440px] rounded-xl border-[1.5px] border-line bg-[#FBFDFC] px-4 py-3 text-[15px] text-ink outline-none"
              />
            </Field>
            <label className="mt-2 flex max-w-[470px] items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-5 w-5 accent-route"
              />
              <span className="text-[14px] leading-snug text-ink-soft">
                <b className="text-ink">I&apos;m authorized to check this organization.</b> I own
                it or have written permission to test it.
              </span>
            </label>
          </Section>
        )}

        {step === 1 && (
          <Section
            eyebrow="Server packages · Trivy"
            title="Run Trivy, then upload the report. (Optional)"
            lede="On a server you want to check, run the command below and upload the file it produces. No server? Skip this step."
          >
            <pre className="max-w-[620px] overflow-x-auto rounded-xl border border-[#21424C] bg-[#10262F] px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-[#CDE7E6]">
              trivy fs --scanners vuln --format json --output sr-report.json /
            </pre>
            <div className="mt-4 max-w-[620px] rounded-xl border-[1.5px] border-dashed border-[#B7CFCC] bg-[#FAFDFC] px-5 py-5">
              <input type="file" accept="application/json,.json" onChange={onTrivyFile} />
              {trivyName && (
                <div className="mt-3 font-mono text-[12px] text-safe">✓ {trivyName} ready</div>
              )}
            </div>
          </Section>
        )}

        {step === 2 && (
          <Section
            eyebrow="Other software · manual"
            title="Software on your computers? (Optional)"
            lede="List desktop or office software you use. We can't scan it, but we'll match each one against MITRE Explorer and flag the known issues to check — marked Advisory."
          >
            <div className="max-w-[680px] overflow-hidden rounded-xl border border-line">
              <div className="grid grid-cols-[1fr_1.4fr_0.9fr_36px] gap-3 bg-[#F4F6F5] px-4 py-2.5 font-mono text-[11px] uppercase tracking-wide text-muted">
                <span>Vendor</span>
                <span>Product</span>
                <span>Version</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1.4fr_0.9fr_36px] items-center gap-3 border-t border-[#EEF2F1] px-4 py-2"
                >
                  {(["vendor", "product", "version"] as const).map((k) => (
                    <input
                      key={k}
                      value={r[k]}
                      placeholder={k === "vendor" ? "Microsoft" : k === "product" ? "Office LTSC" : "2024"}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = { ...next[i], [k]: e.target.value };
                        setRows(next);
                      }}
                      className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none"
                    />
                  ))}
                  <button
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    className="text-muted"
                    aria-label="remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setRows([...rows, { vendor: "", product: "", version: "" }])}
              className="mt-3 font-mono text-[12px] font-bold text-route-deep"
            >
              ＋ Add software
            </button>
          </Section>
        )}

        {step === 3 && (
          <Section
            eyebrow="Run the check"
            title="Ready when you are."
            lede="We'll check what you provided and write a single plain-language report."
          >
            <ul className="max-w-[560px] space-y-2 text-[14px] text-ink-soft">
              <li>🌐 Website: <b className="text-ink">{domain || "—"}</b></li>
              <li>📦 Server packages: <b className="text-ink">{trivyName ?? "skipped"}</b></li>
              <li>
                💻 Other software:{" "}
                <b className="text-ink">
                  {rows.filter((r) => r.product && r.version).length || "none"} item(s)
                </b>
              </li>
            </ul>
            {error && <p className="mt-4 max-w-[560px] text-[13px] text-risk">{error}</p>}
          </Section>
        )}

        <div className="flex-1" />
        <div className="flex items-center gap-3 pt-6">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-xl border-[1.5px] border-line bg-white px-5 py-3 text-[14.5px] font-semibold text-ink-soft"
            >
              ← Back
            </button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <button
              disabled={step === 0 && !canStart}
              onClick={() => setStep(step + 1)}
              className="rounded-xl bg-route px-6 py-3 text-[14.5px] font-semibold text-white disabled:opacity-40"
            >
              Continue →
            </button>
          ) : (
            <button
              disabled={busy || !canStart}
              onClick={run}
              className="rounded-xl bg-route px-6 py-3 text-[14.5px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Checking…" : "Run the check →"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.14em] text-route-deep">
        {eyebrow}
      </p>
      <h1 className="mb-3 max-w-[20ch] font-display text-[32px] font-semibold leading-tight tracking-tight text-ink">
        {title}
      </h1>
      <p className="mb-6 max-w-[58ch] text-[15.5px] leading-relaxed text-ink-soft">{lede}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 max-w-[440px]">
      <label className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</label>
      {children}
    </div>
  );
}
