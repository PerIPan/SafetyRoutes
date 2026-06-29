# SafetyRoutes — todo (from the implementation plan)

> Draft — will be refined after the agent reviews + your answers to the open questions.

## Phase 0 — Foundations
- [ ] Next.js + TypeScript + Tailwind scaffold
- [ ] PostgreSQL schema + migrations (orgs, scans, findings, consent, declared_software, trivy_uploads)
- [ ] `.env` (mitre-explorer base URL, DB)
- [ ] Docker Compose with Artemis running locally
- [ ] Record consent on scan creation

## Phase 1 — Website tier (Artemis)
- [ ] Trigger an Artemis scan for a domain
- [ ] Poll for completion + ingest findings
- [ ] Safe module profile (intrusive off, rate-limiting on)
- [ ] Map web-facing apps → mitre-explorer Applications → CVEs (version-matched)
- [ ] Findings: source=website, confidence=confirmed

## Phase 2 — Packages tier (Trivy)
- [ ] Upload + parse Trivy JSON (PURL / installed / fixed / severity / CVE)
- [ ] Enrich via mitre-explorer `/packages` (by PURL / ecosystem+name)
- [ ] Findings: source=server, confidence=confirmed

## Phase 3 — Other software tier (manual)
- [ ] Product + version entry
- [ ] mitre-explorer Applications lookup (version-filtered)
- [ ] Findings: source=other, confidence=advisory

## Phase 4 — Wizard UI
- [ ] Build the 6 screens from the mock, wired to the backend

## Phase 5 — Report
- [ ] Plain-language, source-tagged, 3-state report + per-finding fix
- [ ] PDF/print export + shareable view

## Phase 6 — Safety & ethics
- [ ] Consent gate (no scan without recorded authorization)
- [ ] Domain allowlist + scope control
- [ ] Artemis rate-limiting config
- [ ] Audit log
- [ ] Safe handling of uploaded Trivy files (size/type limits, untrusted input)

## Phase 7 — Stretch
- [ ] Re-scan to confirm fixes
- [ ] Reminders for still-open findings
- [ ] Exposure-over-time
