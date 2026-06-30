"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/ui";
import { DepthHelp } from "@/components/depth-help";
import { SCAN_PROFILE_META } from "@/lib/scan-profiles";

type SoftwareRow = { vendor: string; product: string; version: string };
type AppSuggestion = { vendor: string; product: string; normalized: string; cveCount: number | null };

const STEPS = ["Permission & site", "Server packages", "Other software", "Run the check"];
// Scan-depth options (labels/blurbs) come from the shared, client-safe lib/scan-profiles.ts
// (SCAN_PROFILE_META) — same source the help modal and the server module mapping use.

export default function NewScan() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [consentBy, setConsentBy] = useState("");
  const [consent, setConsent] = useState(false);
  const [profile, setProfile] = useState("standard");
  const [helpOpen, setHelpOpen] = useState(false);
  const [trivyName, setTrivyName] = useState<string | null>(null);
  const [trivyText, setTrivyText] = useState<string | null>(null);
  const [rows, setRows] = useState<SoftwareRow[]>([
    { vendor: "", product: "", version: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acItems, setAcItems] = useState<AppSuggestion[]>([]);
  const [acRow, setAcRow] = useState<number | null>(null);
  const [acHi, setAcHi] = useState(-1); // keyboard-highlighted suggestion index
  const acTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canStart = domain.trim().length > 0 && consent;
  // Version is required for any software the user lists — without it we can't match the exact CVE
  // set (only a vague vendor/product guess). A row with a product but no version blocks Continue.
  const softwareIncomplete = rows.some((r) => r.product.trim() && !r.version.trim());

  async function onTrivyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrivyName(file.name);
    setTrivyText(await file.text());
  }

  function setRow(i: number, patch: Partial<SoftwareRow>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function onProductType(i: number, value: string) {
    setRow(i, { product: value });
    setAcRow(i);
    setAcHi(-1);
    if (acTimer.current) clearTimeout(acTimer.current);
    if (value.trim().length < 2) {
      setAcItems([]);
      return;
    }
    acTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/applications/search?q=${encodeURIComponent(value)}`)
        .then((res) => res.json())
        .catch(() => ({ items: [] }));
      setAcItems(r.items ?? []);
    }, 250);
  }
  function pickSuggestion(i: number, s: AppSuggestion) {
    setRow(i, { vendor: s.vendor, product: s.product });
    setAcItems([]);
    setAcRow(null);
    setAcHi(-1);
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
          profile,
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

      // kick off the async website (Artemis) scan — the report polls for its results
      if (domain.trim()) {
        await fetch(`/api/scans/${id}/start`, { method: "POST" }).catch(() => {});
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
        <Brand onDark />
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

            <div className="mt-7 max-w-[560px]">
              <div className="mb-2 flex items-center gap-2.5">
                <span className="text-[13px] font-semibold text-ink">
                  How deep should the website check go?
                </span>
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  aria-label="Which should I pick?"
                  className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-route-deep hover:border-route"
                >
                  <span aria-hidden="true">?</span> Which should I pick
                </button>
              </div>
              <div className="grid gap-2">
                {SCAN_PROFILE_META.map((d) => {
                  const on = profile === d.key;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setProfile(d.key)}
                      aria-pressed={on}
                      className={`flex items-start gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition-colors ${
                        on
                          ? "border-route bg-[#F1FAFA]"
                          : "border-line bg-[#FBFDFC] hover:border-route/50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 ${
                          on ? "border-route" : "border-line"
                        }`}
                      >
                        {on && <span className="h-2 w-2 rounded-full bg-route" />}
                      </span>
                      <span>
                        <span className="text-[14px] font-semibold text-ink">{d.label}</span>
                        {d.key === "standard" && (
                          <span className="ml-2 rounded bg-[#E2F1F0] px-1.5 py-0.5 font-mono text-[10px] text-route-deep">
                            recommended
                          </span>
                        )}
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-soft">
                          {d.blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
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
            {/* no overflow-hidden here: it would clip the absolutely-positioned autocomplete
                dropdown. Corners are kept tidy by rounding the header/last row instead. */}
            <div className="max-w-[680px] rounded-xl border border-line">
              <div className="grid grid-cols-[1.4fr_1fr_0.9fr_36px] gap-3 rounded-t-xl bg-[#F4F6F5] px-4 py-2.5 font-mono text-[11px] uppercase tracking-wide text-muted">
                <span>Product</span>
                <span>Vendor</span>
                <span>
                  Version <span className="text-risk" aria-label="required">*</span>
                </span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1.4fr_1fr_0.9fr_36px] items-start gap-3 border-t border-[#EEF2F1] px-4 py-2"
                >
                  <div className="relative">
                    <input
                      value={r.product}
                      placeholder="Start typing… e.g. Office"
                      onChange={(e) => onProductType(i, e.target.value)}
                      onFocus={() => setAcRow(i)}
                      onBlur={() => setTimeout(() => setAcRow((cur) => (cur === i ? null : cur)), 150)}
                      onKeyDown={(e) => {
                        if (acRow !== i || acItems.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setAcHi((h) => Math.min(acItems.length - 1, h + 1));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setAcHi((h) => Math.max(0, h - 1));
                        } else if (e.key === "Enter" && acHi >= 0 && acItems[acHi]) {
                          e.preventDefault();
                          pickSuggestion(i, acItems[acHi]);
                        } else if (e.key === "Escape") {
                          setAcItems([]);
                          setAcHi(-1);
                        }
                      }}
                      role="combobox"
                      aria-expanded={acRow === i && acItems.length > 0}
                      aria-controls={`ac-${i}`}
                      aria-autocomplete="list"
                      aria-activedescendant={
                        acRow === i && acHi >= 0 ? `ac-${i}-${acHi}` : undefined
                      }
                      className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none"
                    />
                    {acRow === i && acItems.length > 0 && (
                      <ul
                        id={`ac-${i}`}
                        role="listbox"
                        className="absolute z-20 mt-1 max-h-64 w-[340px] overflow-auto rounded-lg border border-line bg-white shadow-xl"
                      >
                        {acItems.map((s, idx) => (
                          <li
                            key={s.normalized}
                            id={`ac-${i}-${idx}`}
                            role="option"
                            aria-selected={idx === acHi}
                          >
                            <button
                              type="button"
                              tabIndex={-1}
                              onMouseEnter={() => setAcHi(idx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickSuggestion(i, s);
                              }}
                              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] ${
                                idx === acHi ? "bg-paper" : "hover:bg-paper"
                              }`}
                            >
                              <span className="truncate">
                                <b className="text-ink">{s.product}</b>{" "}
                                <span className="text-muted">· {s.vendor}</span>
                              </span>
                              <span className="shrink-0 font-mono text-[11px] text-muted">
                                {s.cveCount ?? 0} CVEs
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <input
                    value={r.vendor}
                    placeholder="auto-filled"
                    onChange={(e) => setRow(i, { vendor: e.target.value })}
                    className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none"
                  />
                  <input
                    value={r.version}
                    placeholder="2024"
                    aria-invalid={!!(r.product.trim() && !r.version.trim())}
                    onChange={(e) => setRow(i, { version: e.target.value })}
                    className={`rounded-md border bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none ${
                      r.product.trim() && !r.version.trim() ? 'border-risk' : 'border-line'
                    }`}
                  />
                  <button
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    className="mt-1.5 text-muted"
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
              <li>
                🔎 Depth:{" "}
                <b className="text-ink">
                  {SCAN_PROFILE_META.find((d) => d.key === profile)?.label ?? "Standard"}
                </b>
              </li>
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
        <div className="flex items-center gap-3 border-t border-line pt-6">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-xl border-[1.5px] border-line bg-white px-5 py-3 text-[14.5px] font-semibold text-ink-soft"
            >
              ← Back
            </button>
          )}
          <div className="flex flex-1 items-center justify-end gap-3">
            {step === 0 && !canStart && (
              <span className="text-[13px] text-muted">
                Enter a website and tick the authorization box to continue
              </span>
            )}
            {step === 2 && softwareIncomplete && (
              <span className="text-[13px] text-risk">
                Add a version for each software you listed — it’s required to match the right
                issues (or remove the row).
              </span>
            )}
            {step < STEPS.length - 1 ? (
              <button
                disabled={(step === 0 && !canStart) || (step === 2 && softwareIncomplete)}
                onClick={() => setStep(step + 1)}
                className="rounded-xl bg-route px-6 py-3 text-[14.5px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
              >
                Continue →
              </button>
            ) : (
              <button
                disabled={busy || !canStart}
                onClick={run}
                className="rounded-xl bg-route px-6 py-3 text-[14.5px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
              >
                {busy ? "Checking…" : "Run the check →"}
              </button>
            )}
          </div>
        </div>
      </main>

      <DepthHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        depths={SCAN_PROFILE_META}
        value={profile}
        onPick={(k) => {
          setProfile(k);
          setHelpOpen(false);
        }}
      />
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
