"use client";

import { useState } from "react";
import { Modal, HelpLink } from "@/components/modal";

/** Per-step "what to fill in and how" documentation, shown from a "How this step works" link under
 *  each wizard step's lede. The server step is deliberately absent — its command embeds a live org
 *  token, so ServerStep owns its own Modal instead (see components/server-step.tsx). */
type GenericStepKey = "select" | "website" | "software" | "run";

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft first:mt-0">{children}</p>
  );
}
function H({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[13px] font-semibold text-ink">{children}</p>;
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{children}</p>;
}

export const STEP_HELP: Record<
  GenericStepKey,
  { eyebrow: string; title: string; body: React.ReactNode }
> = {
  select: {
    eyebrow: "What to check",
    title: "Choosing what to check",
    body: (
      <>
        <P>
          Pick <b className="text-ink">one or more</b> of the three checks — each is optional, and
          everything you choose is merged into a single plain-language report.
        </P>
        <ul className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-ink-soft">
          <li>
            <b className="text-ink">🌐 Your website</b> — we actively scan a site you run for known
            vulnerabilities, exposed files, and missing security basics. Needs a URL you’re
            authorized to test.
          </li>
          <li>
            <b className="text-ink">💻 Other software</b> — list desktop or office software you use.
            We can’t scan it, but we match each item against{" "}
            <b className="text-ink">MITRE Explorer</b> and flag the known issues to check (marked{" "}
            <i>Advisory</i>). No scanning needed.
          </li>
          <li>
            <b className="text-ink">📦 Server packages</b> — a small collector runs Trivy on a server
            you own and pushes back only the vulnerability report. It’s usually already waiting.
          </li>
        </ul>
        <H>How to choose</H>
        <P>
          Pick everything relevant — a typical nonprofit chooses <b className="text-ink">Website</b>{" "}
          and <b className="text-ink">Server packages</b>. You can combine all three.
        </P>
        <Note>
          Your selection is only editable on this first step — changing it later brings you back
          here. Every finding, whatever its source, is cross-referenced against MITRE Explorer for
          CVE detail and attacker-technique (ATT&amp;CK) context.
        </Note>
      </>
    ),
  },

  website: {
    eyebrow: "Website",
    title: "Checking your website",
    body: (
      <>
        <P>
          This step runs a <b className="text-ink">read-only</b> scan of a website you control — it
          only looks, and never changes anything.
        </P>
        <H>What to fill in</H>
        <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-ink-soft">
          <li>
            <b className="text-ink">Website address</b> — type the domain (we add{" "}
            <span className="font-mono text-[12px]">https://</span> for you), e.g.{" "}
            <span className="font-mono text-[12px]">yourcharity.org</span>.
          </li>
          <li>
            Or tick <b className="text-ink">Use the built-in DVWA test site</b> — a
            deliberately-vulnerable demo bundled with the scanner, so you can see what a real finding
            looks like without touching your own site.
          </li>
          <li>
            <b className="text-ink">Authorization</b> — tick the box to confirm you own the site or
            have written permission to test it. We only scan sites you’re allowed to. Your name is
            optional and simply recorded alongside that consent.
          </li>
        </ul>
        <H>How deep should it go?</H>
        <P>
          Essentials, Standard, or Thorough — they’re all safe and read-only and differ only in how
          much they look at. When in doubt pick <b className="text-ink">Standard</b>. Use the{" "}
          <b className="text-ink">“Which should I pick”</b> button for a side-by-side comparison you
          can select from.
        </P>
        <Note>
          Heads-up: if your site sits behind Cloudflare or another CDN/firewall, the deeper network
          checks may be blocked and we’ll say so on the report. Cloudflare’s “Development Mode” does
          not help — it only turns off caching, not the firewall.
        </Note>
      </>
    ),
  },

  software: {
    eyebrow: "Other software · manual",
    title: "Listing other software",
    body: (
      <>
        <P>
          Use this for desktop or office software we can’t scan directly — think Microsoft Office,
          Adobe Acrobat, a database server. We match what you list against known vulnerabilities and
          flag the ones worth checking, marked <b className="text-ink">Advisory</b>.
        </P>
        <H>How to fill in a row</H>
        <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-ink-soft">
          <li>
            <b className="text-ink">Product</b> — start typing and pick from the suggestions. The
            type-ahead is powered by <b className="text-ink">MITRE Explorer</b>’s applications
            catalog and shows how many CVEs each product has.
          </li>
          <li>
            <b className="text-ink">Vendor</b> — auto-fills when you pick a suggestion (you can edit
            it).
          </li>
          <li>
            <b className="text-ink">Version</b> (required) — vulnerability matching is
            version-specific, so without it we can’t tell whether a given CVE actually affects you.
          </li>
        </ul>
        <P>
          Use <b className="text-ink">＋ Add software</b> for more rows. Examples:{" "}
          <span className="font-mono text-[12px]">Microsoft Office · 2019</span>,{" "}
          <span className="font-mono text-[12px]">Adobe Acrobat · 2021</span>.
        </P>
        <H>How MITRE Explorer is used</H>
        <P>
          Each product + version is resolved to its <b className="text-ink">MITRE Explorer</b> entry
          and matched to known CVEs. Because nothing is scanned, these come back as{" "}
          <b className="text-ink">Advisory</b> — “worth checking on that machine” rather than
          “confirmed on your system”. Each one links out to MITRE Explorer with CVSS severity and
          ATT&amp;CK technique context.
        </P>
      </>
    ),
  },

  run: {
    eyebrow: "Run the check",
    title: "Running the check",
    body: (
      <>
        <P>
          This is the summary. When you run it, we check everything you provided and write a single
          plain-language report, then take you straight to it.
        </P>
        <H>What happens</H>
        <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-ink-soft">
          <li>
            The <b className="text-ink">website</b> scan runs <b className="text-ink">live</b> — it
            takes a few minutes and you’ll watch progress on the report page.
          </li>
          <li>
            <b className="text-ink">Other software</b> and <b className="text-ink">server packages</b>{" "}
            are matched/ingested immediately.
          </li>
          <li>
            You can add or refresh a server report on the finished report later — nothing here is
            final.
          </li>
        </ul>
        <H>What powers your report</H>
        <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-ink-soft">
          <li>
            <b className="text-ink">Artemis</b> — the website scanner.
          </li>
          <li>
            <b className="text-ink">Trivy</b> — the server-package scanner (runs on your own machine).
          </li>
          <li>
            <b className="text-ink">MITRE Explorer</b> — the vulnerability intelligence tying it all
            together: CVSS scoring, the KEV “known-exploited” flag, and MITRE ATT&amp;CK technique
            mapping shown on every finding, each linking out to mitre-explorer.org.
          </li>
        </ul>
      </>
    ),
  },
};

/** Self-contained "How this step works" link + modal for a generic wizard step. */
export function StepHelpLink({ stepKey }: { stepKey: GenericStepKey }) {
  const [open, setOpen] = useState(false);
  const c = STEP_HELP[stepKey];
  return (
    <>
      <HelpLink onClick={() => setOpen(true)} />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={c.eyebrow}
        title={c.title}
        titleId={`step-help-${stepKey}`}
        footer={
          <button
            onClick={() => setOpen(false)}
            className="rounded-xl bg-route px-5 py-2.5 text-[14px] font-semibold text-white"
          >
            Got it
          </button>
        }
      >
        {c.body}
      </Modal>
    </>
  );
}
