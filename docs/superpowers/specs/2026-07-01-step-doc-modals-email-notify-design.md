# Design — Per-step documentation modals, Trivy-card reframe, email-notify (display-only)

Date: 2026-07-01
Branch: `feat/step-doc-modals-email-notify`
Status: approved (design), pending implementation

## Problem / motivation

Three related UI gaps on the SafetyRoutes web app:

1. **No inline guidance.** The `/new` wizard steps show inputs but no "what do I fill in and how"
   help. There's one good precedent — the accessible `DepthHelp` modal on the Website step's depth
   picker — but nothing else.
2. **Report Trivy card is over-prominent / stale framing.** The report page's `ServerCheck` card
   ("Check a server (optional)") shows a full docker one-liner inline. Now that Trivy is
   **automated** (host collector → org inbox → adopted at scan-creation), the card's manual per-scan
   command reads like the primary path when it's really a *fallback*.
3. **No email-notifications affordance.** Users want a "notify me" entry point next to "Copy share
   link" — but only as a **display-only** preview for now (no backend).

## Goals

- Add a **detailed walkthrough** documentation modal to **each** wizard step, opened by a subtle
  "How this step works →" text link **under the step's lede**.
- **Move** the report Trivy card's docker command into a documentation modal; **reframe** the card
  so automation is the headline and the one-off command is a fallback.
- Explain **MITRE Explorer** and how it's used, where relevant.
- Add an **Email notifications** button next to "Copy share link" opening a **display-only** modal
  (name, email, frequency, repeat-count); Save shows an in-modal confirmation. **No network, no
  persistence, no backend.**

## Non-goals

- No real email/notification backend, scheduling, or storage (explicitly display-only).
- No change to scan/ingest/adopt APIs or the collector.
- No refactor of `DepthHelp` (left untouched to keep the diff low-risk; it keeps its own a11y copy).
- No new dependencies.

## Chosen approach

**Shared accessible `Modal` shell + small content components.** Extract the focus-trap / Esc &
backdrop close / scroll-lock / `aria-modal` logic (which already exists in `DepthHelp`) into a
reusable `components/modal.tsx`. Every new modal (step help, Trivy command, email form) reuses it, so
there is exactly one a11y implementation. A shared `HelpLink` gives every trigger an identical look.

Rejected alternatives:
- *One modal per feature, no shared shell* — duplicates ~40 lines of focus-trap/aria 3–4×.
- *Inline `<details>` disclosures* — user asked for modals; detailed content clutters the step inline.

## Architecture

### New files

**`web/components/modal.tsx`**
- `Modal` — presentational, accessible modal shell.
  - Props: `{ open: boolean; onClose: () => void; eyebrow?: string; title: string; titleId?: string;
    children: React.ReactNode; footer?: React.ReactNode }`.
  - Behavior (ported from `DepthHelp`): remember trigger + restore focus on close; lock
    `document.body` scroll while open; initial focus to the close button; **Esc** closes; **Tab**
    focus-trap within panel; backdrop click closes; `role="dialog"` + `aria-modal="true"` +
    `aria-labelledby`. `print:hidden`. Returns `null` when `!open`.
  - Visual: matches `DepthHelp` — `max-w-[640px]`, rounded-2xl, `border-line bg-surface`, header with
    eyebrow (`font-mono uppercase text-route-deep`) + `font-display` title + `×` close; optional
    footer row.
- `HelpLink` — the shared trigger. A text button styled as
  `font-mono text-[12px] font-bold text-route-deep`, label defaults to "How this step works →"
  (overridable via `label`). Props: `{ onClick: () => void; label?: string }`.

**`web/components/step-help.tsx`**
- `STEP_HELP: Record<"select" | "website" | "software" | "run", { eyebrow: string; title: string;
  body: React.ReactNode }>` — detailed walkthrough content (see "Modal content" below).
- `StepHelpLink({ stepKey })` — self-contained: renders `HelpLink` + `Modal` wired to local `open`
  state, pulling content from `STEP_HELP`. Used for the four generic steps.
- The **server** step is NOT in this registry — its command needs a live token, so `ServerStep` owns
  its own `Modal` (below).

**`web/components/email-notify.tsx`**
- `EmailNotifyButton()` — a bordered button "🔔 Email notifications" + a `Modal` containing the
  display-only form. All state is local (`useState`); **no fetch, no persistence.**
  - Fields: **Name** (text), **Email** (email), **Frequency** (Weekly / Monthly segmented toggle),
    **Repeat** (number input — "Send it N times").
  - Footer: "Save preferences" button. On click, swap the form body for an in-modal confirmation
    state — e.g. *"🔔 You're set — we'll email {email || 'you'} {frequency} for {n} update(s)."* — and
    a muted line *"Preview — email notifications aren't active yet."* No data leaves the browser.
  - "Done"/close resets to the form for next open.

### Edited files

**`web/app/new/page.tsx`**
- `Section` gains optional `help?: React.ReactNode`, rendered directly under the lede `<p>`.
- Pass `help={<StepHelpLink stepKey="select" />}` (etc.) for `select`, `website`, `software`, `run`.
- The **server** step passes no `help` — `ServerStep` renders its own `HelpLink` at the top of its
  output (visually still just under the lede), so its modal can embed the live-token command.
- No change to wizard logic/state.

**`web/components/server-step.tsx`** (wizard server step — holds the org ingest token)
- Replace the inline collapsible "Connect your server (one-time setup)" (`showSetup` +
  `<pre>`) with a `Modal` (`showSetup` becomes the modal's open state) opened by a `HelpLink`
  ("How this step works →") placed at the top of the component.
- Modal content (detailed walkthrough): how the automated collector works (install once + schedule →
  auto-adopted); the one-time docker command with **copy** (live `status.token`/`status.endpoint`);
  scheduling via `scripts/sr-trivy-collector.sh`; token privacy; **trust boundary** (execution stays
  on host, only JSON report received); manual upload fallback; a note that **Trivy findings are
  enriched via MITRE Explorer** (CVSS, KEV, ATT&CK).
- Keep the waiting/needs-report status card and the manual file-upload inline on the step (they're
  status/primary actions, not docs).

**`web/components/server-check.tsx`** (report page — holds the per-scan upload token)
- **Reframe** the card, automation-first. New heading/intro leads with: server results are included
  automatically from the collector; *"Need to add or refresh server results on **this** report?"*
- Move the docker `<pre>` command + copy + the token-privacy note **into a `Modal`** opened by a
  `HelpLink` ("How to check a server →"). Modal also cross-references the collector as the
  recommended route for ongoing coverage, states the trust boundary + "needs Docker", and notes MITRE
  enrichment.
- Keep the file-upload fallback visible on the card.
- `cmd`/`endpoint`/token construction stays in `ServerCheck`; just rendered inside the modal.

**`web/components/report-actions.tsx`**
- Insert `<EmailNotifyButton />` immediately after the "Copy share link" button (before the
  `flex-1` spacer), so it sits in the left action cluster.

### Data flow

- Step-help modals: static content; zero data flow.
- `ServerStep` modal: existing `/api/inbox/status` fetch already provides `token`/`endpoint` used to
  build the command — unchanged; only presentation moves into the modal.
- `ServerCheck` modal: existing `scanId` + per-scan `token` + `origin` build the command — unchanged.
- `EmailNotifyButton`: **no** data flow — purely local component state.

## Modal content (detailed walkthrough)

**What to check (`select`).** What the step does; the three options and what each produces; that you
can pick several and they merge into one plain-language report; how to choose (typical nonprofit =
Website + Server); note that selection is only editable on step 1. Brief: findings are
cross-referenced against MITRE Explorer for CVE detail.

**Website (`website`).** Enter a site you own (`https://…`) or tick the built-in **DVWA** test target;
authorization + consent and *why* (read-only, only sites you're allowed to test); optional name
recorded with consent; depth levels (Basic/Standard/Thorough) in brief → point to the existing
"Which should I pick" interactive picker; **CDN/Cloudflare gotcha** (deeper network checks may be
blocked; Dev Mode doesn't help). Reassure: read-only, changes nothing.

**Other software (`software`).** How to fill a row: start typing the **product** → autocomplete
(type-ahead is powered by **MITRE Explorer**'s applications DB, showing CVE counts) → **vendor**
auto-fills → **version** (required, and *why*: CVE matching is version-specific). Advisory-only: we
don't scan these — we **match each app against MITRE Explorer** and flag known CVEs as **Advisory**
to check. Examples (Microsoft Office 2019, Adobe Acrobat 2021). `＋ Add software` for more rows.

**Server packages (`server`, owned by `ServerStep`).** Automated collector happy-path (install once,
schedule, auto-adopted); one-time docker command (live token, copy); scheduling via
`sr-trivy-collector.sh`; token privacy; trust boundary; manual upload; **Trivy vulns are enriched via
MITRE Explorer** (CVSS scoring, KEV known-exploited flag, ATT&CK techniques).

**Run the check (`run`).** What happens on run: we check what you provided and write one report; the
website scan runs **live** (a few minutes, live progress) while software/server are matched/ingested
immediately; you can add a server report to the finished report later. **What powers your report:**
*Artemis* (website scanning), *Trivy* (server packages), **MITRE Explorer** (CVE intelligence — CVSS
scoring, KEV, and MITRE ATT&CK technique mapping shown on every finding, each linking out to
`mitre-explorer.org`).

**Report Trivy card (owned by `ServerCheck`).** One-off per-scan command (copy) to add/refresh server
results on *this* report; token-in-link is unique to this scan (don't share); for ongoing coverage
use the collector; trust boundary + needs Docker; MITRE enrichment note.

## Accessibility

All modals inherit from the shared `Modal`: focus trap, initial focus + focus restore, Esc &
backdrop close, body-scroll lock, `role="dialog"`/`aria-modal`/`aria-labelledby`. Triggers are real
`<button>`s with discernible text. Segmented Frequency control uses `aria-pressed`. Email confirmation
state is announced via an `aria-live="polite"` region.

## Testing & verification

- `npm run build` (Next) + lint clean; `npx tsc --noEmit` clean.
- `npm test` (vitest) still passes — no logic touched; add lightweight render/interaction tests for
  `Modal` (opens/closes on Esc & backdrop) and `EmailNotifyButton` (form → confirmation, no fetch) if
  a jsdom/RTL setup exists; otherwise rely on build + manual click-through.
- Manual: open every step's "How this step works →"; open/close via Esc, backdrop, ×; Trivy card link
  shows command + copy works; email modal Save → confirmation, and confirm **no network request** is
  issued (devtools).
- Per `web/AGENTS.md`: these are client components using patterns already in the repo (useState/
  useEffect/useRouter, Tailwind tokens). No new Next.js APIs expected; if any Next-specific surface is
  touched, consult `web/node_modules/next/dist/docs/` first.

## Risks

- **Content drift** — walkthrough copy could go stale vs. behavior. Mitigation: keep copy factual and
  derived from current code (collector/adopt flow, MITRE enrichment, depth picker).
- **Display-only email modal mistaken for functional** — mitigation: explicit "Preview — not active
  yet" line; no submit endpoint exists to call.
- **A11y regression** in the extracted shell — mitigation: port `DepthHelp`'s logic verbatim; manual
  keyboard pass.

## File-change summary

New: `web/components/modal.tsx`, `web/components/step-help.tsx`, `web/components/email-notify.tsx`.
Edit: `web/app/new/page.tsx`, `web/components/server-step.tsx`, `web/components/server-check.tsx`,
`web/components/report-actions.tsx`.
Untouched: `web/components/depth-help.tsx`, all APIs, the collector.
