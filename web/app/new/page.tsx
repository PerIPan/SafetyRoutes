"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/ui";
import { DepthHelp } from "@/components/depth-help";
import { StepHelpLink } from "@/components/step-help";
import { ServerStep } from "@/components/server-step";
import { SCAN_PROFILE_META } from "@/lib/scan-profiles";

type SoftwareRow = { id: string; vendor: string; product: string; version: string };
type AppSuggestion = { vendor: string; product: string; normalized: string; cveCount: number | null };
type StepKey = "select" | "website" | "software" | "server" | "run";
type Tier = "website" | "software" | "server";

// The bundled deliberately-vulnerable test app — a container on the scanner's Docker network
// (see lib/net-guard.ts INTERNAL_SCAN_HOSTS + lib/nuclei-scan.ts).
const DVWA_HOST = "dvwa";

const STEP_LABEL: Record<StepKey, string> = {
  select: "What to check",
  website: "Website",
  software: "Other software",
  server: "Server packages",
  run: "Run the check",
};

const OPTIONS: { key: Tier; icon: string; title: string; blurb: string }[] = [
  {
    key: "website",
    icon: "🌐",
    title: "Your website",
    blurb:
      "We scan a site you run for known vulnerabilities, exposed files, and missing security basics.",
  },
  {
    key: "software",
    icon: "💻",
    title: "Other software",
    blurb:
      "List desktop or office software you use — we match each against known issues to check. No scanning needed.",
  },
  {
    key: "server",
    icon: "📦",
    title: "Server packages",
    blurb:
      "Check the software installed on a server you own. A small collector runs the scan there and sends back only the report.",
  },
];

export default function NewScan() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Record<Tier, boolean>>({
    website: false,
    software: false,
    server: false,
  });

  const [domain, setDomain] = useState("");
  const [useDvwa, setUseDvwa] = useState(false);
  const [consentBy, setConsentBy] = useState("");
  const [consent, setConsent] = useState(false);
  const [profile, setProfile] = useState("standard");

  // Optional org context — tailors the plain-language business-impact summary (sent to Gemini).
  const [organizationName, setOrganizationName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [whatOrgDoes, setWhatOrgDoes] = useState("");
  const [whoWeServe, setWhoWeServe] = useState("");
  const [sensitiveData, setSensitiveData] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  // Stable row ids (NOT array index) so React reconciles correctly across add/remove and the
  // autocomplete never binds to the wrong row. Deterministic seed avoids SSR/hydration mismatch.
  const rowSeq = useRef(1);
  const newRowId = () => `row-${rowSeq.current++}`;
  const [rows, setRows] = useState<SoftwareRow[]>([
    { id: "row-0", vendor: "", product: "", version: "" },
  ]);
  const [acItems, setAcItems] = useState<AppSuggestion[]>([]);
  const [acRow, setAcRow] = useState<string | null>(null); // open dropdown's row id
  const [acHi, setAcHi] = useState(-1);
  const acTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [trivyText, setTrivyText] = useState<string | null>(null);
  const [trivyName, setTrivyName] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic step order: selection first, then the chosen tiers (website → software → server LAST),
  // then run. Selection is only editable on the first step, so `step` never dangles.
  const stepKeys: StepKey[] = [
    "select",
    ...(selected.website ? (["website"] as StepKey[]) : []),
    ...(selected.software ? (["software"] as StepKey[]) : []),
    ...(selected.server ? (["server"] as StepKey[]) : []),
    "run",
  ];
  const cur = stepKeys[step];
  const isLast = step === stepKeys.length - 1;

  const anySelected = selected.website || selected.software || selected.server;
  const websiteReady = useDvwa || domain.trim().length > 0;
  // A row "counts" once it has a product; such a row then REQUIRES a version. Advancing the software
  // step needs at least one complete row AND no product-without-version (so empty rows can't silently
  // skip the step, and a lone first row is accepted on its own).
  const softwareRows = rows.filter((r) => r.product.trim());
  const softwareIncomplete = softwareRows.some((r) => !r.version.trim());
  const softwareHasData = softwareRows.length > 0;
  const canAdvance =
    cur === "select"
      ? anySelected
      : cur === "website"
        ? websiteReady && (useDvwa || consent)
        : cur === "software"
          ? softwareHasData && !softwareIncomplete
          : true;

  function toggle(t: Tier) {
    setSelected((s) => ({ ...s, [t]: !s[t] }));
    if (step > 0) setStep(0); // selection is only meant to change on the first step
  }

  function setRow(id: string, patch: Partial<SoftwareRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function onProductType(id: string, value: string) {
    setRow(id, { product: value });
    setAcRow(id);
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
  function pickSuggestion(id: string, s: AppSuggestion) {
    setRow(id, { vendor: s.vendor, product: s.product });
    setAcItems([]);
    setAcRow(null);
    setAcHi(-1);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const domainVal = selected.website ? (useDvwa ? DVWA_HOST : domain.trim()) : null;
      const scanRes = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: domainVal,
          consentBy: consentBy.trim() || null,
          ownershipVerified: true,
          ownershipMethod: useDvwa ? "internal-test-target" : "owner-allowlist",
          profile,
          organizationName: organizationName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          whatOrgDoes: whatOrgDoes.trim() || null,
          whoWeServe: whoWeServe.trim() || null,
          sensitiveData: sensitiveData.trim() || null,
        }),
      });
      const { id } = await scanRes.json();

      if (selected.software) {
        const software = rows.filter((r) => r.product.trim() && r.version.trim());
        if (software.length) {
          await fetch(`/api/scans/${id}/declared-software`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ items: software }),
          });
        }
      }

      if (selected.server) {
        if (trivyText) {
          const up = await fetch(
            `/api/scans/${id}/trivy-upload?filename=${encodeURIComponent(trivyName ?? "report.json")}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: trivyText },
          );
          if (!up.ok) throw new Error((await up.json()).error ?? "Trivy upload failed");
        } else {
          // adopt the report the collector already pushed to the inbox (no-op if none waiting)
          await fetch(`/api/scans/${id}/adopt-server-report`, { method: "POST" }).catch(() => {});
        }
      }

      if (selected.website && domainVal) {
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
          {stepKeys.map((key, i) => (
            <li key={key} className="flex items-start gap-3.5 py-2.5">
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
                  {STEP_LABEL[key]}
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
          Step {step + 1} of {stepKeys.length}
        </div>

        {cur === "select" && (
          <Section
            eyebrow="What to check"
            title="What would you like to check?"
            lede="Pick one or more. Each one is optional — choose what fits your organization, and we'll merge everything into a single plain-language report."
            help={<StepHelpLink stepKey="select" />}
          >
            <div className="grid max-w-[680px] gap-3">
              {OPTIONS.map((o) => {
                const on = selected[o.key];
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => toggle(o.key)}
                    aria-pressed={on}
                    className={`flex items-start gap-4 rounded-2xl border-[1.5px] px-5 py-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-route focus-visible:ring-offset-2 ${
                      on ? "border-route bg-[#F1FAFA]" : "border-line bg-[#FBFDFC] hover:border-route/50"
                    }`}
                  >
                    <span className="text-[24px] leading-none">{o.icon}</span>
                    <span className="flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink">{o.title}</span>
                        {o.key === "server" && (
                          <span className="rounded bg-[#E2F1F0] px-1.5 py-0.5 font-mono text-[10px] text-route-deep">
                            auto-collect
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">
                        {o.blurb}
                      </span>
                    </span>
                    <span
                      className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${
                        on ? "border-route bg-route text-white" : "border-line"
                      }`}
                    >
                      {on && <span className="text-[12px] leading-none">✓</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {!anySelected && (
              <p className="mt-4 text-[13px] text-muted">Select at least one to continue.</p>
            )}

            <div className="mt-8 max-w-[680px] rounded-xl border border-line bg-[#FBFDFC] p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-route-deep">
                Tailor your report · optional
              </p>
              <p className="mb-3 mt-1 text-[13px] leading-snug text-ink-soft">
                A few words about your organization help us explain what each finding means for the
                people you serve. Leave blank to skip — you can always come back to this step.
              </p>
              <div className="mb-4 rounded-lg border border-[#C2E1DF] bg-[#F1FAFA] px-3.5 py-3 text-[12.5px] leading-snug text-ink-soft">
                <span className="font-semibold text-route-deep">How your report is written:</span>{" "}
                once the checks finish, your findings, the details below, and a short summary of your
                website&apos;s public pages are sent to Google Gemini, which writes a plain-language
                business-impact summary at the top of your report. It uses only that information — it
                won&apos;t invent figures, losses, or compliance claims. If the AI is unavailable, a
                built-in template is used instead.
              </div>
              <Field label="Organization name">
                <input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Riverside Community Clinic"
                  className="w-full rounded-xl border-[1.5px] border-line bg-white px-4 py-3 text-[15px] text-ink outline-none"
                />
              </Field>
              <Field label="Contact email (optional)">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="security@example.org"
                  className="w-full rounded-xl border-[1.5px] border-line bg-white px-4 py-3 text-[15px] text-ink outline-none"
                />
              </Field>
              <Field label="What does your organization do?">
                <input
                  value={whatOrgDoes}
                  onChange={(e) => setWhatOrgDoes(e.target.value)}
                  placeholder="e.g. a small community health clinic"
                  className="w-full rounded-xl border-[1.5px] border-line bg-white px-4 py-3 text-[15px] text-ink outline-none"
                />
              </Field>
              <Field label="Who do you serve?">
                <input
                  value={whoWeServe}
                  onChange={(e) => setWhoWeServe(e.target.value)}
                  placeholder="e.g. patients and local donors"
                  className="w-full rounded-xl border-[1.5px] border-line bg-white px-4 py-3 text-[15px] text-ink outline-none"
                />
              </Field>
              <Field label="Sensitive data you hold">
                <input
                  value={sensitiveData}
                  onChange={(e) => setSensitiveData(e.target.value)}
                  placeholder="e.g. donor payment details, health records"
                  className="w-full rounded-xl border-[1.5px] border-line bg-white px-4 py-3 text-[15px] text-ink outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-snug text-muted">
                  Used only to tailor your report — sent to Google Gemini along with the findings.
                </p>
              </Field>
            </div>
          </Section>
        )}

        {cur === "website" && (
          <Section
            eyebrow="Website"
            title="Which website should we check?"
            lede="The website scan is read-only and only ever runs against sites you're authorized to test."
            help={<StepHelpLink stepKey="website" />}
          >
            <div className="mb-4 max-w-[560px]">
              <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                Your website address
              </label>
              <div
                className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 ${
                  useDvwa
                    ? "border-line bg-[#F1F3F2] opacity-60"
                    : "border-route bg-[#FBFDFC] shadow-[0_0_0_4px_rgba(14,156,165,0.14)]"
                }`}
              >
                {!useDvwa && <span className="font-mono text-[13px] text-muted">https://</span>}
                <input
                  value={useDvwa ? "dvwa  (built-in test app)" : domain}
                  onChange={(e) => setDomain(e.target.value)}
                  disabled={useDvwa}
                  placeholder="yourcharity.org"
                  className="w-full bg-transparent text-[15px] text-ink outline-none disabled:cursor-not-allowed"
                />
              </div>
              <label className="mt-2.5 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={useDvwa}
                  onChange={(e) => setUseDvwa(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-route"
                />
                <span className="text-[13px] leading-snug text-ink-soft">
                  Use the built-in <b className="text-ink">DVWA</b> test site — a deliberately-vulnerable
                  demo app bundled with the scanner. Great for seeing what a real finding looks like.
                  <a
                    href="https://github.com/digininja/DVWA"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 font-mono text-[11px] text-route-deep underline"
                  >
                    what&apos;s this?
                  </a>
                </span>
              </label>
            </div>

            {!useDvwa ? (
              <>
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
              </>
            ) : (
              <p className="max-w-[470px] rounded-xl border border-route/30 bg-[#F1FAFA] px-4 py-3 text-[13px] text-ink-soft">
                ✓ Authorized — this is the scanner&apos;s own bundled test target, safe to scan.
              </p>
            )}

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
                        on ? "border-route bg-[#F1FAFA]" : "border-line bg-[#FBFDFC] hover:border-route/50"
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

        {cur === "software" && (
          <Section
            eyebrow="Other software · manual"
            title="Software on your computers?"
            lede="List desktop or office software you use. We can't scan it, but we'll match each one against MITRE Explorer and flag the known issues to check — marked Advisory."
            help={<StepHelpLink stepKey="software" />}
          >
            <div className="max-w-[680px] rounded-xl border border-line">
              <div className="grid grid-cols-[1.4fr_1fr_0.9fr_36px] gap-3 rounded-t-xl bg-[#F4F6F5] px-4 py-2.5 font-mono text-[11px] uppercase tracking-wide text-muted">
                <span>Product</span>
                <span>Vendor</span>
                <span>
                  Version <span className="text-risk" aria-label="required">*</span>
                </span>
                <span />
              </div>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[1.4fr_1fr_0.9fr_36px] items-start gap-3 border-t border-[#EEF2F1] px-4 py-2"
                >
                  <div className="relative">
                    <input
                      value={r.product}
                      placeholder="Start typing… e.g. Office"
                      onChange={(e) => onProductType(r.id, e.target.value)}
                      onFocus={() => setAcRow(r.id)}
                      onBlur={() => setTimeout(() => setAcRow((c) => (c === r.id ? null : c)), 150)}
                      onKeyDown={(e) => {
                        if (acRow !== r.id || acItems.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setAcHi((h) => Math.min(acItems.length - 1, h + 1));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setAcHi((h) => Math.max(0, h - 1));
                        } else if (e.key === "Enter" && acHi >= 0 && acItems[acHi]) {
                          e.preventDefault();
                          pickSuggestion(r.id, acItems[acHi]);
                        } else if (e.key === "Escape") {
                          setAcItems([]);
                          setAcHi(-1);
                        }
                      }}
                      role="combobox"
                      aria-expanded={acRow === r.id && acItems.length > 0}
                      aria-controls={`ac-${r.id}`}
                      aria-autocomplete="list"
                      aria-activedescendant={
                        acRow === r.id && acHi >= 0 ? `ac-${r.id}-${acHi}` : undefined
                      }
                      className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none"
                    />
                    {acRow === r.id && acItems.length > 0 && (
                      <ul
                        id={`ac-${r.id}`}
                        role="listbox"
                        // keep the product input focused if the user clicks the list chrome (scrollbar)
                        onMouseDown={(e) => e.preventDefault()}
                        className="absolute z-20 mt-1 max-h-64 w-[340px] overflow-auto rounded-lg border border-line bg-white shadow-xl"
                      >
                        {acItems.map((s, idx) => (
                          <li
                            key={s.normalized}
                            id={`ac-${r.id}-${idx}`}
                            role="option"
                            aria-selected={idx === acHi}
                          >
                            <button
                              type="button"
                              tabIndex={-1}
                              onMouseEnter={() => setAcHi(idx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickSuggestion(r.id, s);
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
                    onChange={(e) => setRow(r.id, { vendor: e.target.value })}
                    className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none"
                  />
                  <input
                    value={r.version}
                    placeholder="2024"
                    aria-invalid={!!(r.product.trim() && !r.version.trim())}
                    onChange={(e) => setRow(r.id, { version: e.target.value })}
                    className={`rounded-md border bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none ${
                      r.product.trim() && !r.version.trim() ? "border-risk" : "border-line"
                    }`}
                  />
                  <button
                    onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                    className="mt-1.5 text-muted"
                    aria-label="remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setRows((rs) => [...rs, { id: newRowId(), vendor: "", product: "", version: "" }])}
              className="mt-3 font-mono text-[12px] font-bold text-route-deep"
            >
              ＋ Add software
            </button>
          </Section>
        )}

        {cur === "server" && (
          <Section
            eyebrow="Server packages · Trivy"
            title="Check a server you own"
            lede="A small collector runs Trivy on your server and pushes the report here on a schedule — so it's usually already waiting. You can also upload a report file instead."
          >
            <ServerStep
              onManualReport={(text, name) => {
                setTrivyText(text);
                setTrivyName(name);
              }}
              manualName={trivyName}
            />
          </Section>
        )}

        {cur === "run" && (
          <Section
            eyebrow="Run the check"
            title="Ready when you are."
            lede="We'll check what you provided and write a single plain-language report."
            help={<StepHelpLink stepKey="run" />}
          >
            <ul className="max-w-[560px] space-y-2 text-[14px] text-ink-soft">
              {selected.website && (
                <li>
                  🌐 Website:{" "}
                  <b className="text-ink">{useDvwa ? "DVWA (built-in test app)" : domain || "—"}</b>
                  <span className="text-muted">
                    {" "}
                    · {SCAN_PROFILE_META.find((d) => d.key === profile)?.label ?? "Standard"}
                  </span>
                </li>
              )}
              {selected.software && (
                <li>
                  💻 Other software:{" "}
                  <b className="text-ink">
                    {rows.filter((r) => r.product && r.version).length || "none"} item(s)
                  </b>
                </li>
              )}
              {selected.server && (
                <li>
                  📦 Server packages:{" "}
                  <b className="text-ink">{trivyName ?? "the report your collector pushed"}</b>
                </li>
              )}
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
            {cur === "select" && !anySelected && (
              <span className="text-[13px] text-muted">Pick at least one check to continue</span>
            )}
            {cur === "website" && !canAdvance && (
              <span className="text-[13px] text-muted">
                {useDvwa ? "" : "Enter a website and tick the authorization box to continue"}
              </span>
            )}
            {cur === "software" && !softwareHasData && (
              <span className="text-[13px] text-muted">
                Add at least one product (with its version) to continue.
              </span>
            )}
            {cur === "software" && softwareIncomplete && (
              <span className="text-[13px] text-risk">
                Add a version for each software you listed (or remove the row).
              </span>
            )}
            {!isLast ? (
              <button
                disabled={!canAdvance}
                onClick={() => setStep(step + 1)}
                className="rounded-xl bg-route px-6 py-3 text-[14.5px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
              >
                Continue →
              </button>
            ) : (
              <button
                disabled={busy || !anySelected}
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
  help,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  help?: React.ReactNode;
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
      <p className="mb-2 max-w-[58ch] text-[15.5px] leading-relaxed text-ink-soft">{lede}</p>
      {/* help trigger sits ~8px under the lede; the server step renders its own HelpLink as its
          first child (it needs a live token), so no spacer is emitted there — keeps the lede→trigger
          gap identical across every step. */}
      {help && <div className="mb-6">{help}</div>}
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
