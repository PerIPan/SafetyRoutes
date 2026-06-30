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

### 2. LLM business-impact summarizer  — design presented, not built
Uses **local subscription Claude (not an API)**. Reads the LCO's website + light online research,
combines it with the three vulnerability sets, and writes a **soft-worded** business-impact summary
with a **realistic timeline** (who-they-are / what-this-means / a-plan).
- [ ] schema: `scans.impact_summary` (text/jsonb) + report card UI
- [ ] pipeline: site text + web research + 3 finding sets → summary (tone rules: reassure, don't alarm)
- [ ] Path A (in-session) vs Path B (headless `claude -p`) — pick per run
- [ ] store + render; regenerate on demand

---

_Detailed, reviewed sub-plan lives alongside this file in `docs/`. Keep this list as the
single-glance roadmap; check items off as they ship._
