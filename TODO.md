# SafetyRoutes — feature TO-DO / roadmap

Vulnerability-scanning wizard for non-technical Local Community Organizations (LCOs). One
plain-language report across three tiers: **Website**, **Server packages**, **Other software**.
Statuses below reflect what's shipped vs planned.

---

## ✅ Shipped

### Website tier
- [x] Artemis (CERT-Polska) LCO-focused hygiene modules — safe/low-impact only; bruters & injectors deliberately excluded
- [x] Decoupled `nuclei -as` vuln scan (wappalyzer fingerprint → only matching templates, not all 13,320)
- [x] Exposures overlay (tech-agnostic `http/exposures/` + `http/exposed-panels/`) — caught a real MySQL dump that `-as` alone misses
- [x] Tri-state run-state + honest "green" gate (no false "no issues" on a dead/timed-out scan)
- [x] No-HTTPS finding; hardened scheme probe (real HTTP response required)
- [x] 5-agent review (architect/security/pentest/perf) + live verification on rest.vulnweb.com

### Server packages tier
- [x] Trivy JSON report upload → MITRE Explorer enrichment (severity re-derived; KEV / EPSS / CVSS)
- [x] Untrusted-upload hardening (size cap, shape validation, dedupe, enrich-call cap)
- [ ] **Trivy auto-collect (push/inbox)** — host runs `trivy fs /` on cron & pushes; wizard adopts the waiting report. **Reviewed, not built** → see [docs/trivy-auto-collect-todo.md](docs/trivy-auto-collect-todo.md)

### Other software tier
- [x] Manual product + version entry (version mandatory) → MITRE Explorer CVE lookup

### Wizard / report / ops
- [x] Scan-depth profiles (Essentials / Standard / Thorough)
- [x] Animated "Scanning…" banner; report page during-scan state (no wizard link mid-scan)
- [x] README refresh + screenshots; Docker + Artemis setup guide; scan-authorization env (`SCAN_ALLOWLIST` / `SCAN_ALLOW_ANY`)

---

## 🔜 Planned

### 1. Trivy auto-collect (push/inbox)  — design reviewed, ready to build
Host's Trivy runs on its own schedule and **pushes** the report so it's "waiting" when the
non-technical user runs the wizard. Full phased plan + folded-in architect/security findings:
**[docs/trivy-auto-collect-todo.md](docs/trivy-auto-collect-todo.md)**.
- [ ] Phase 0 — prereq migration: `trivy_uploads.idempotency_key` → `UNIQUE(scan_id, idempotency_key)`
- [ ] Phase 1 — `organizations.ingest_token` + append-only `trivy_inbox` + `POST /api/ingest/trivy` (Bearer, fail-closed, ≤8 MB, rate-limited) + collector script
- [ ] Phase 2 — wizard auto-adoption (copy blob → **non-destructive merge**; staleness surfaced; manual upload fallback)
- [ ] Phase 3 — "Connect your server" setup panel + README "Automatic server scanning"

### 2. Gemini business-impact report  — design approved (spec written), building now
**Revamped approach** (was local Claude): deterministic pre-classifier → **Google Gemini**
(`gemini-flash-latest`, API) → grounded business-impact summary at the **top** of the report,
tailored via 3 optional org-context wizard fields. Deterministic template = fallback. Salvages
dev's scaffolding onto `main` (no branching), drops Ollama, keeps the printable auth page.
Full design + folded-in architect/ai-engineer review:
**[docs/superpowers/specs/2026-07-01-gemini-business-impact-report-design.md](docs/superpowers/specs/2026-07-01-gemini-business-impact-report-design.md)**

- [x] **P1 Foundation (TDD):** types (BusinessReport w/ impacts[], OrgContext, AuthorizationSnapshot) · 5 schema cols · `rowToFinding` idempotencyKey fix · `selectForReport` in report.ts (dedupe→band sort→per-source floor→top 20) + tests proving Trivy-CVE-burial fix
- [x] **P2 Persistence + cache-bust:** `createScan`/`rowToScan`/`saveBusinessReport` · `replaceSourceFindings` nulls business_report* in-txn
- [x] **P3 LLM adapter (TDD):** `fallbackBusinessReport(selected, omittedCount)` · Gemini client (responseSchema + safetySettings BLOCK_ONLY_HIGH + finishReason branching + 15s + no-numbers post-filter + thinkingBudget=0) · injected-transport tests
- [x] **P4 Route:** GET/POST orchestration + audit + fallback
- [x] **P5 Wizard:** org name + contact email + whatOrgDoes/whoWeServe/sensitiveData (+ "sent to Google" note) → POST
- [x] **P6 Presentation:** `business-summary.tsx` (render impacts) mounted top-of-report · port `authorization/page.tsx` + `print-button.tsx`
- [x] **P7 Verify:** `next build` + tsc + 38 tests green · live Gemini smoke passed (clinic report, grounded, no fabricated figures) · migration applied

---

_Detailed, reviewed sub-plan lives alongside this file in `docs/`. Keep this list as the
single-glance roadmap; check items off as they ship._
