"use client";

import { useState } from "react";

/** Shown on the report only when the website tier couldn't run the deeper web checks (the
 *  "couldn't fully check" advisory) — almost always because the site is behind a CDN/WAF that
 *  blocks the port-discovery step. Gives the CORRECT, research-backed guidance (notably: Cloudflare
 *  "Development Mode" does NOT help — it only bypasses caching, not the firewall). */
export function CdnHelp() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6 rounded-2xl border border-[#E8D3AE] bg-[#FBF4E6] p-5 print:hidden">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#A6690F]">
        Heads-up · CDN / firewall
      </div>
      <h2 className="mt-1 font-display text-[19px] font-semibold text-ink">
        Your site looks like it’s behind a CDN or firewall
      </h2>
      <p className="mt-1 max-w-[66ch] text-[13.5px] leading-relaxed text-ink-soft">
        A service like Cloudflare sits in front of your website and blocks part of our scan (the
        network/port checks), so the deeper website tests couldn’t run. The basic checks still
        completed. For a <b className="text-ink">complete</b> check, you — or whoever manages your
        website/IT — can briefly let our scanner through.
      </p>
      <p className="mt-2 max-w-[66ch] text-[13.5px] leading-relaxed text-[#7A2E1C]">
        ⚠️ <b>Cloudflare’s “Development Mode” will not help</b> — it only turns off caching, not the
        firewall or bot protection.
      </p>

      <button
        onClick={() => setOpen(!open)}
        className="mt-3 font-mono text-[12px] font-bold text-route-deep"
      >
        {open ? "▾ Hide the steps" : "▸ How to let the scanner through"}
      </button>

      {open && (
        <div className="mt-2 max-w-[72ch] rounded-xl border border-line bg-surface px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
          <b className="text-ink">If you use Cloudflare (the common case):</b>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5">
            <li>
              Open the Cloudflare dashboard →{" "}
              <span className="font-mono text-[12px] text-ink">Security → WAF → Custom Rules</span>.
            </li>
            <li>
              Add a rule matching the public IP your SafetyRoutes scanner runs from (
              <span className="font-mono text-[12px]">ip.src eq &lt;your scanner IP&gt;</span>), set
              the action to <b className="text-ink">Skip</b>, and tick <i>Managed Rules</i>,{" "}
              <i>Rate limiting</i>, and <i>Super Bot Fight Mode</i>.
            </li>
            <li>
              On Cloudflare’s <b>Free</b> plan, also switch <b>Bot Fight Mode</b> off for the scan —
              it can’t be allowed per-IP.
            </li>
            <li>
              Re-run the check here, then <b className="text-ink">remove the rule</b> when you’re
              done.
            </li>
          </ol>
          <p className="mt-2 text-muted">
            Cloudflare explicitly allows you to scan a site you own. Other CDNs/firewalls have an
            equivalent “allow this IP” option. Avoid “Pause Cloudflare” — it switches off all
            protection and exposes your server.
          </p>
        </div>
      )}
    </section>
  );
}
