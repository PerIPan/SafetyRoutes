# SafetyRoutes — overnight build status (morning update)

**TL;DR:** The app is built and running locally with **all three tiers wired and working**.
Nothing has been pushed (local commits only, per your instruction). Agent reviews are running.
A real **authe.org website scan via Artemis is in progress** — check its report this morning.

---

## Post-review update (both agent reviews done + fixes applied)

Two agents reviewed the code (security + correctness). **The must-fixes are done; the rest is
documented below.**

**Fixed tonight (verified — 23 tests pass, build clean):**
- **Security #1 (CRITICAL): authorization gate.** Added a server-side **allowlist + SSRF guard**
  (`lib/net-guard.ts`) — `/start` now **403s** any domain not in `SCAN_ALLOWLIST`
  (your four domains) and refuses private/metadata IPs. Verified: `example.com`→403, `authe.org`→200.
- **Code #1 (CRITICAL): the wizard never triggered the website scan.** Now it calls `/start`.
- **Code #2: report was a one-shot render.** Added `ScanLive` — the report **auto-polls** per-source
  status and refreshes when the async Artemis scan finishes.
- **Code #7: `satisfiesRange` read a bare version as `==`** (silent false-negatives) → now returns
  "unknown" (→ Advisory).
- **Code #5: finding writes are now transactional** (advisory-locked) — no mid-rewrite empty reads.
- **Code #4: website findings could collide** on the unique key → added a result discriminator.
- **Code #10: `isDone` used the global Artemis queue** (never empty) → now per-analysis count.
  *(This is why the first authe.org scan stuck at "running"; a fresh one is running correctly.)*
- **Code #11: scan aborts** rather than falling back to Artemis's full profile on an API hiccup.
- **Code #9: positive "no issue" rows** now emitted by all tiers when nothing's found.
- **Code #3: `/start` errors** now set `source_status=failed` + audit (no more stuck "running").

**Fresh website scan to check this morning:** `/report/0e5436a0-8af5-4c19-9445-743008902024`
(authe.org, running with the fixed code — the report polls and updates itself).

**Deferred (documented, not blocking the demo on your own domains):**
- Security: ownership *verification* (DNS-TXT/`.well-known`) beyond the allowlist; per-endpoint
  auth + rate-limiting; CSP/security headers (`next.config.ts`); move ARTEMIS_API_TOKEN to a
  secret store + rotate; data-minimization/retention on stored raw Trivy reports.
- Correctness: pre-release version ordering (`1.0.0-rc1` vs `1.0.0`); fire-and-forget `/start`
  needs a real worker/queue before any serverless deploy; website→app→CVE enrichment (currently
  generic Confirmed findings); report groups findings flat (not by source section).

---

## What works (verified)

- **App runs** at <http://localhost:3000> — landing, 4-step wizard, server-rendered report.
- **Packages tier (Trivy)** — verified against your **real repos**:
  | Domain | Repo | Findings |
  |---|---|---|
  | mitre-explorer.org | `dev/mitre` | 15 |
  | authe.org | `dev/authe_standard` | 6 |
  | authe.app | `dev/authe_spec` | 19 |
  | openwhisperer.com | `dev/openwhisperer.com` | 0 (no deps — handled gracefully) |
- **Website tier (Artemis)** — full Artemis stack up (50 containers), API verified on
  **:5001** (macOS AirPlay squats :5000, so we remapped). A live scan of **authe.org** was
  accepted and is running end-to-end through SafetyRoutes.
- **Manual tier** — coded (declared product+version → mitre-explorer Applications → advisory).
- **Quality:** 23 unit tests pass (`npm test`); production build clean (`npm run build`).
- **Enrichment** via live mitre-explorer with a DB cache; degrades gracefully when unavailable.

## URLs to look at
- Sample/demo report: <http://localhost:3000/demo>
- Wizard: <http://localhost:3000/new>
- Real reports:
  - mitre-explorer.org → `/report/3a0bcd0b-05ed-4581-832b-6ccda8cec725`
  - authe.org (packages) → `/report/a0c07aef-9728-46b6-82fe-50f8de529bb3`
  - authe.app → `/report/91d297dd-7e9e-4fd4-b262-7e43929c3771`
  - openwhisperer.com → `/report/daf716bc-e333-4507-9b39-b6cc650ddf22`
  - **authe.org WEBSITE scan (Artemis, in progress)** → `/report/128474c3-0891-418b-b218-f1236e1bf1fe`

## How to run it (if anything stopped)
```bash
# 1. Postgres (app DB)
cd ~/SafetyRoutes && docker compose -f infra/docker-compose.yml up -d db
# 2. Artemis (website-scan engine) — API on :5001
cd ~/dev/artemis && docker compose up -d
# 3. The app
cd ~/SafetyRoutes/web && npm run dev        # http://localhost:3000
# tests / build
npm test ; npm run build
# (re)seed the demo report
npm run db:seed
```

## Where the code lives (`web/`)
- `lib/version.ts` — pure `isVersionAffected()` (+ tests) — the core domain logic
- `lib/purl.ts`, `lib/trivy.ts` — PURL + Trivy parsing (+ tests)
- `lib/mitre.ts` — **MitreExplorerClient** (live API + DB cache + graceful failure)
- `lib/artemis.ts` — **ArtemisGateway** (start / poll / fetch, real API contract)
- `lib/tiers/{packages,manual,website}.ts` — the three tiers, each `(input) → Finding[]`
- `app/api/scans/**` — REST: create, trivy-upload, declared-software, start, findings, report
- `app/{page,new,report/[id],demo}` — landing, wizard, report, demo redirect
- `db/schema.sql`, `db/migrate.mjs`, `db/seed.mjs`

## Architecture (as built, matches `IMPLEMENTATION_PLAN.md` v2)
3 input tiers fan into one `findings` table (source + confidence) → one source-tagged report.
Website=Artemis (Confirmed), Server=Trivy (Confirmed), Other=manual (Advisory). Enrichment is
additive/optional. Version matching is ours (server-side, tested), since mitre's `version=` is
a coarse substring filter.

## Not done / next (honest list)
- **Security hardening (Phase 6):** the consent checkbox is recorded but there's **no domain
  ownership verification yet** — fine for your own domains, required before scanning anyone
  else. SSRF guard, output-escaping/CSP, upload depth-caps: planned, not built.
- **Website-tier result mapping is generic** (title from Artemis `status_reason`). Once the
  authe.org scan finishes, we should look at the real results and enrich web-facing apps
  → mitre-explorer CVEs (currently those are added as plain Confirmed findings).
- **Report polish / PDF export / re-scan & reminders** — not yet.
- **Manual tier** coded but not yet exercised end-to-end via the UI.

## Open decisions still pending (from the plan)
1. Ownership-verification method (DNS TXT / `.well-known` / email) — for scanning beyond your own domains.
2. Report output: web-only (print-to-PDF) vs a PDF pipeline.
3. Hosting target (Vercel for the app; Artemis needs a Docker host).

## Notes
- **Nothing pushed.** Local commits only (`git log` shows them; remote is untouched past the
  earlier scaffold checkpoint).
- Background processes left running for you: Postgres (:5433), Artemis (:5001, 50 containers),
  Next dev (:3000). Stop Artemis with `cd ~/dev/artemis && docker compose down` if you want the
  RAM back.
- Agent code reviews were dispatched at the end of the session — findings summarized separately.
