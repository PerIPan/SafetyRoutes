# SafetyRoutes — Implementation Plan (draft for review)

> Status: **draft**, pending agent review + open questions. Bootcamp deliverable
> (Ransomware Defence Summer Bootcamp, Virtual Routes, 29 Jun – 3 Jul 2026).

## 1. Goal & scope

Build a **guided wizard** that helps Local Community Organizations (LCOs — small charities,
non-profits, SMEs) find and understand their exposure, then act on it — responsibly, at
scale, and in plain language.

Three input sources, one **source-tagged** report:

| Source | Tool | Input | Confidence |
|---|---|---|---|
| **Website** | Artemis + Nuclei (bundled) | a domain (automatic scan) | **Confirmed** |
| **Server packages** | Trivy (org-run) | an uploaded Trivy JSON report | **Confirmed** |
| **Other software** | manual entry | product + version | **Advisory** |

All three are enriched/prioritized by **mitre-explorer** (CVEs, KEV/EPSS, ATT&CK technique,
plain language). We **promise**: "we scan your internet-facing surface and your server
packages, and advise on other software you tell us about." We **do not promise** to scan
installed desktop apps remotely.

## 2. Architecture

```
            ┌──────────────────────── Wizard (web UI) ────────────────────────┐
            │  S1 consent+domain · S2 sources · S3 Trivy upload ·             │
            │  S4 manual software · S5 progress · S6 report                   │
            └───────────────┬────────────────────────────────────────────────┘
                            │ REST
            ┌───────────────▼────────────── SafetyRoutes backend ────────────┐
            │  jobs/orchestration · findings store · enrichment · report gen │
            └───┬───────────────┬────────────────────┬──────────────────────┘
   trigger scan │     ingest     │ upload             │ lookup (REST)
            ┌───▼────┐      ┌────▼─────┐         ┌─────▼──────────┐
            │ Artemis│      │  Trivy   │         │ mitre-explorer │
            │ (Docker│      │ (org-run │         │  /applications │
            │ Compose│      │  JSON)   │         │  /packages     │
            │ +Nuclei│      └──────────┘         │  /cves         │
            └────────┘                           └────────────────┘
```

- **Wizard (frontend):** the 6-screen flow already prototyped in `mock/wizard.html`.
- **Backend:** receives wizard input, runs/collects scans, enriches via mitre-explorer,
  stores findings, generates the report.
- **Artemis:** runs in Docker Compose; scans the domain; we read its results.
- **Trivy:** the org runs it on their own server and uploads the JSON; we parse by PURL.
- **mitre-explorer:** external REST API (the team's own project) — knowledge/enrichment.

### Confidence model
- **Confirmed** — a tool actively observed it (Artemis/Nuclei on the web surface; Trivy on
  the package set). For Artemis, still version-banner-based, so "actively detected", not
  absolute.
- **Advisory — verify locally** — known to affect a declared product+version, but nothing
  was scanned. Never shown as Confirmed.
- **No issue found** — checked, nothing detected.

## 3. Tech stack (proposed — open to the architect's view)

| Layer | Choice | Why |
|---|---|---|
| Wizard + backend | **Next.js (App Router) + TypeScript + Tailwind** | matches mitre-explorer's stack and the team's Vercel workflow; one repo, API routes for the backend |
| DB | **PostgreSQL** | orgs, scans, findings, consent, declared software, uploads |
| Scan engine | **Artemis** via **Docker Compose** | the website tier; Nuclei bundled |
| Package scan | **Trivy** (org-run, uploaded) | server packages; no agent/creds |
| Knowledge | **mitre-explorer REST API** | CVEs + packages enrichment |
| Jobs | DB-backed job rows + a poller (no heavy queue for the bootcamp) | Artemis scans are async |

## 4. Data model (first cut)

- `organizations` (id, name, created_at)
- `scans` (id, org_id, domain, status, consent_at, consent_by, created_at, finished_at)
- `consent` (scan_id, authorized_by, method, recorded_at)  — or folded into `scans`
- `findings` (id, scan_id, **source** [website|server|other], **confidence**
  [confirmed|advisory|no_issue], title, plain_explanation, severity_plain, fix_text,
  cve_id, purl, package_name, ecosystem, installed_version, fixed_version, module, created_at)
- `declared_software` (id, scan_id, vendor, product, version)  — the manual tier
- `trivy_uploads` (id, scan_id, filename, parsed_count, uploaded_at)

All tables: `created_at` / `updated_at`, UUID PKs, FK indexes (per house conventions).

## 5. Phases

### Phase 0 — Foundations
- Next.js + TS + Tailwind scaffold; Postgres schema + migrations; `.env` for mitre-explorer
  base URL; Docker Compose with Artemis brought up locally; consent recorded on scan create.
- **Done when:** Artemis runs locally and a scan row can be created with consent.

### Phase 1 — Website tier (Artemis)
- Trigger an Artemis scan for a domain; poll for completion; ingest findings.
- Map web-facing apps (webapp_identifier output) → mitre-explorer Applications → CVEs
  (version-matched client-side).
- Enable a safe module profile; **intrusive modules off**; rate-limiting on.
- **Done when:** a domain scan yields source=website, confidence=confirmed findings.

### Phase 2 — Packages tier (Trivy)
- Upload + parse Trivy JSON (`Results[].Vulnerabilities[]` → PURL, installed, fixed,
  severity, CVE); enrich each via mitre-explorer `/packages` (by PURL / ecosystem+name).
- **Done when:** an uploaded report yields source=server, confidence=confirmed findings.

### Phase 3 — Other software tier (manual)
- Product + version entry → mitre-explorer Applications (version-filtered) → advisory CVEs.
- **Done when:** declared software yields source=other, confidence=advisory findings.

### Phase 4 — Wizard UI
- Build the 6 screens (from the mock) as real components wired to the backend.

### Phase 5 — Report
- Plain-language, source-tagged, 3-state report; severity in plain words; per-finding fix;
  PDF/print export + shareable view.

### Phase 6 — Safety & ethics
- Consent gate (no scan without recorded authorization); domain allowlist; Artemis
  rate-limiting (`LOCK_SCANNED_TARGETS`, `REQUESTS_PER_SECOND`); audit log of what was
  scanned, when, with which modules; safe handling of uploaded Trivy files (size/type limits,
  treat as untrusted).

### Phase 7 — Stretch
- Re-scan to confirm fixes; reminders for still-open findings; exposure-over-time.

## 6. Integration specifics

- **Artemis:** verify how to trigger a scan and read results programmatically (HTTP API vs
  its Karton/PostgreSQL backend). *[VERIFY — see open questions]*
- **mitre-explorer:** Applications (`/api/v1/applications…`, `/api/v1/cves/{id}`) and Packages
  (`/api/v1/packages/{ecosystem}/{name}`, `/api/v1/cves/{id}/packages`); version handling is
  coarse server-side → we do the real version match client-side. A2A is rate-limited
  (~50/day) — use the REST endpoints; consider self-hosting a copy for the demo if volume is
  higher.
- **Trivy:** ingest `--format json` output; join to mitre-explorer by PURL.

## 7. Risks & open questions

(see the dedicated section at the bottom)

## 8. todo.md
A `todo.md` checklist is generated alongside this plan, one item per phase task.

---

## Unresolved questions (please answer — terse ok)

1. Hosting for Artemis? (needs a Docker host; Vercel can't run it) — local-only for demo, or a VM?
2. mitre-explorer for the demo: hit the live API, or self-host a copy? (rate limits)
3. Real consented scans during the bootcamp, or demo against our own test sites only?
4. Stack: Next.js (matches mitre-explorer) — OK, or prefer a separate React SPA + Node API?
5. Report output: web view + PDF, or web view only for the bootcamp?
6. Is the manual "Other software" tier in-scope for the demo, or stretch?
