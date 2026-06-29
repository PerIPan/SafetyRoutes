# SafetyRoutes — todo (vertical slices, post-review)

> Build end-to-end slices, not layers. Demo-safe from Slice 0. Artemis (Slice 4) starts in
> parallel on day 1 and merges only when working. See `IMPLEMENTATION_PLAN.md`.

## Slice 0 — Scaffold + fixture (demo-safe from hour 1)
- [ ] Next.js + TS + Tailwind; port the 6 mock screens to React components
- [ ] Postgres: `organizations`, `scans`, `findings` (+ enums) + migrations
- [ ] `POST /api/scans` (create + consent, one consent per scan)
- [ ] `fixtures/demo-scan.json` — canned findings (all 3 sources, all 3 confidences)
- [ ] Report screen renders from fixture
- [ ] Sources optional (1, 2, or 3) — nullable inputs + `source_status`

## Slice 1 — Trivy tier (low risk, build first)
- [ ] `POST /api/scans/:id/trivy-upload` — size cap (~5 MB), schema-validate, stream-parse
- [ ] Parse `Results[].Vulnerabilities[]` → PURL / installed / fixed / severity / CVE
- [ ] PURL→ecosystem map (deb→debian, apk→alpine, rpm→rhel, npm, pypi, …)
- [ ] Enrich via mitre `/packages/{ecosystem}/{name}` (KEV/EPSS/plain-language)
- [ ] findings: `source=server, confidence=confirmed` (+ idempotency key, no dup on re-upload)

## Slice 2 — Manual tier (stretch)
- [ ] `POST /api/scans/:id/declared-software`
- [ ] mitre Applications: resolve slug → CVEs → client-side `isVersionAffected`
- [ ] empty `affectedApps` / no version → `advisory` (never confirmed)
- [ ] findings: `source=other, confidence=advisory`

## Slice 3 — Report polish
- [ ] Group by source + confidence; positive `no_issue` rows shown
- [ ] Plain-English severity + per-finding fix; escape all rendered strings (CSP, no innerHTML)

## Slice 4 — Artemis tier (start day 1, merge when working) — needs Docker
- [ ] Colima + Docker; bring up Artemis; set `X-Api-Token`
- [ ] `ArtemisGateway`: `POST /api/add` (tag `sr-{scan_id}`, pinned safe module allowlist)
- [ ] Poll `num-queued-tasks` + `num-pending-tasks` (2× zero, 30s apart) + 20 min timeout
- [ ] Fetch `task-results`; parse module `result` defensively
- [ ] Map app→slug (static `config/artemis-product-map.json` first, search fallback) → CVEs
- [ ] findings: `source=website, confidence=confirmed`

## Cross-cutting (MitreExplorerClient)
- [ ] `MitreExplorerClient` wraps all mitre calls + `mitre_cache` table
- [ ] pure, unit-tested `isVersionAffected()` (server-side)
- [ ] cache slug/CVE/package responses; pre-warm before demo

## Safety gates (before any REAL scan — see plan §6)
- [ ] Domain-ownership verification (DNS TXT / `.well-known` / email) — or own-test-sites allowlist
- [ ] SSRF guard (block private/metadata IPs, intake + scan time)
- [ ] Artemis safe profile pinned; low RPS; `LOCK_SCANNED_TARGETS`
- [ ] Append-only `scan_audit`; secrets out of repo (gitleaks); retention/purge

## Cut to stretch / post-bootcamp
- [ ] PDF pipeline (use print CSS for demo), pagination, auth/multi-org, re-scan/reminders
