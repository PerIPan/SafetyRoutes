# SafetyRoutes — Implementation Plan (v2, post-review)

> Revised after parallel review by architecture, security, API/integration, database, and
> feasibility agents. Bootcamp deliverable (Ransomware Defence Summer Bootcamp, 29 Jun – 3
> Jul 2026). Open decisions are listed at the end — a few need your call before we lock it.

## 1. Goal & scope

A guided wizard that helps non-technical Local Community Organizations (LCOs) find and
understand their exposure, responsibly and in plain language. **Three input sources, one
source-tagged report:**

| Source | Tool | Input | Confidence | Demo priority |
|---|---|---|---|---|
| **Website** | Artemis + Nuclei | a domain (active scan) | Confirmed | **Crown** — start day 1, merge when working |
| **Server packages** | Trivy (org-run) | uploaded Trivy JSON | Confirmed | **Core** — lowest risk, build first |
| **Other software** | manual entry | product + version | Advisory | **Stretch** — cheap (~½ day), cut first if needed |

**Recommended scope (resolves the plan-vs-README conflict the architect flagged):** ship
**Website + Server packages** as the demo core; **Other software** is a cheap stretch.

**Decisions locked (from review answers):**
- **Start small** — keep it minimal first; small caps (e.g. Trivy upload ~5 MB).
- **Sources are optional** — a user can run **1, 2, or 3** sources; `scans.domain` and the
  Trivy/manual inputs are all nullable, and `source_status` tracks only what was chosen.
- **One consent per scan** — folded into the `scans` row (no separate consent table).
- **`no_issue` is written as a positive row** — "we checked X and it's fine" is shown in the
  report (better than silent absence).
- **Artemis has a real HTTP API** (FastAPI :5000, `X-Api-Token`) — no internal-DB scraping;
  see §5 for the confirmed trigger/poll/fetch contract.

## 2. Architecture

Three independent tier pipelines fan **in** to one findings store and one report:

```
Wizard (Next.js) ─POST─▶ SafetyRoutes backend
                          ├─ runWebsiteTier(domain)   ─▶ ArtemisGateway ─▶ Artemis (Docker)
                          ├─ runPackagesTier(trivyJson)─▶ parse by PURL
                          ├─ runManualTier(declared[]) ─▶ (stretch)
                          │        every tier calls ▼
                          ├─ MitreExplorerClient (enrich + version-match + cache + gotchas)
                          ├─ findings store (Postgres)
                          └─ report assembler (findings → view model)
```

**Key seams (from the architecture review — these make the tiers independently testable):**

- **`ArtemisGateway`** — wraps Artemis's HTTP API behind *our* interface: `startScan(domain,
  modules) → analysisId`, `pollStatus(analysisId) → state`, `fetchFindings(analysisId) →
  raw[]`. The rest of the pipeline never touches Artemis internals.
- **`MitreExplorerClient`** — the single anti-corruption layer over mitre-explorer. Owns:
  slug resolution, the CVE/packages calls, response **caching**, and the **pure, unit-tested
  `isVersionAffected(detectedVersion, start, end, ecosystem)`** function (server-side, never
  browser-side — don't leak CVE lists, keep it testable). Both Website and Manual tiers use it.
- **Each tier is `(input, deps) → Finding[]`** — pure-ish, injectable deps, testable in
  isolation. The orchestrator persists; the report assembler reads. Enrichment is **additive
  and optional**: a finding is valid without it (degrade gracefully if mitre-explorer is down).

**Confidence model (the backbone):** every finding carries `source` + `confidence`.
**Confirmed** = a tool actively observed it (Artemis web surface; Trivy package set).
**Advisory** = known for a declared product+version, nothing scanned. **No issue** = checked,
clean. Enforced in the DB (enums), not just the UI. Empty `affectedApps` / undetermined
version → **downgrade to Advisory**, never silently Confirmed (api review R8).

## 3. Build order — vertical slices (demo-first)

Build **end-to-end slices**, not horizontal layers, so something is demoable from hour 1.

| Slice | Delivers | Effort | Risk |
|---|---|---|---|
| **0 · Scaffold + fixture** | 6 wizard screens (from the mock) as React; `scans`/`findings`/`organizations` tables; `POST /api/scans`; a **canned `fixtures/demo-scan.json`** the report renders → demo-safe from day 1 | ~½ day | none |
| **1 · Trivy tier** | upload + parse Trivy JSON by PURL → enrich via mitre `/packages` → `source=server, confidence=confirmed` | ½–1 day | low |
| **2 · Manual tier** *(stretch)* | product+version → mitre Applications (client-side version match) → `source=other, confidence=advisory` | ½ day | low |
| **3 · Report polish** | group by source/confidence, plain-English severity, per-finding fix | ½ day | none |
| **4 · Artemis tier** | `ArtemisGateway` live: start → poll → fetch → map app→slug→CVEs → `source=website, confidence=confirmed`. **Start day 1 in parallel; merge only when working.** Until then the Website section shows clearly-labelled fixture data | 1–2 days | **HIGH** |

Minimal concept-proof = Slices **0 + 1 + 3** (consent → Trivy upload → enrichment →
source-tagged plain-language report). Artemis is the crown, not the proof.

## 4. Data model (revised — from the database + API reviews)

```sql
CREATE TYPE scan_status      AS ENUM ('pending','verifying','scanning','enriching','done','failed','timed_out');
CREATE TYPE finding_source   AS ENUM ('website','server','other');
CREATE TYPE finding_confidence AS ENUM ('confirmed','advisory','no_issue');
CREATE TYPE finding_severity AS ENUM ('critical','high','medium','low','info');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- consent folded in (no separate table); job lifecycle on the scan row
CREATE TABLE scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  domain text,                              -- null if website tier not chosen
  status scan_status NOT NULL DEFAULT 'pending',
  -- consent + ownership evidence (security review R1)
  consent_by text, consent_method text, consent_at timestamptz,
  ownership_verified bool NOT NULL DEFAULT false,
  ownership_token text, ownership_method text,   -- dns-txt | well-known | email
  -- artemis job linkage (api review R7)
  artemis_analysis_id text, artemis_tag text,    -- tag = "sr-{scan_id}"
  -- per-source partial status (api review)
  source_status jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX idx_scans_org_id ON scans(org_id);

CREATE TABLE trivy_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id),
  filename text, raw_json jsonb NOT NULL, parsed_count int, skipped_count int,
  idempotency_key text UNIQUE,             -- sha256(raw_json)
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_trivy_uploads_scan_id ON trivy_uploads(scan_id);

CREATE TABLE declared_software (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id),
  vendor text, product text NOT NULL, version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_declared_software_scan_id ON declared_software(scan_id);

-- one polymorphic findings table (correct for a single unified report)
CREATE TABLE findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id),
  source finding_source NOT NULL,
  confidence finding_confidence NOT NULL,
  title text NOT NULL, plain_explanation text,
  severity finding_severity, severity_plain text, fix_text text,
  cve_id text,
  -- website
  artemis_finding_id text, module text,
  -- server
  trivy_upload_id uuid REFERENCES trivy_uploads(id),
  purl text, package_name text, ecosystem text, installed_version text, fixed_version text,
  -- other
  declared_software_id uuid REFERENCES declared_software(id),
  -- enrichment state (degrade gracefully)
  enrichment_status text NOT NULL DEFAULT 'pending',  -- pending | done | unavailable
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_finding_idem UNIQUE (scan_id, idempotency_key)
);
CREATE INDEX idx_findings_scan ON findings(scan_id);
CREATE INDEX idx_findings_scan_source ON findings(scan_id, source);
CREATE INDEX idx_findings_scan_conf ON findings(scan_id, confidence);
CREATE INDEX idx_findings_scan_sev ON findings(scan_id, severity);
CREATE INDEX idx_findings_cve ON findings(cve_id) WHERE cve_id IS NOT NULL;

-- mitre-explorer response cache (rate-limit defense, api review)
CREATE TABLE mitre_cache (
  cache_key text PRIMARY KEY,             -- "app:apache/http_server" | "cve:CVE-..." | "pkg:debian/openssl"
  response_json jsonb NOT NULL, fetched_at timestamptz NOT NULL, ttl_hours int NOT NULL DEFAULT 24
);

-- append-only audit (security review R9) — app user gets INSERT/SELECT only, no UPDATE/DELETE
CREATE TABLE scan_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL, event text NOT NULL, detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Idempotency keys:** Artemis `sha256(scan_id+artemis_finding_id+module)`, Trivy
`sha256(scan_id+purl+cve_id)`, manual `sha256(scan_id+declared_software_id+cve_id)`. On
re-ingest, supersede prior same-source rows.

## 5. Integration contracts

### Artemis (HTTP API, v2.7.0 — confirmed)
- **Start:** `POST /api/add` `{targets:[domain], tag:"sr-{scan_id}", enabled_modules:[…]}`
  with `X-Api-Token` header → `{ids:[analysisId]}`. Store `artemis_analysis_id` + tag.
- **Poll (every 30 s):** Artemis has **no single "done" flag**. Poll `GET /api/analyses`
  (`num_pending_tasks`) **and** `GET /api/num-queued-tasks` for the module set; require **two
  consecutive zero-readings 30 s apart** (stabilization) before "done"; **hard timeout 20 min**
  → `timed_out` with partial results.
- **Fetch:** `GET /api/task-results?analysis_id=…&only_interesting=true&page_size=500`,
  paginate; `receiver` = module name; `result` = **module-specific JSON** (inspect real
  output — parse defensively, skip+count unknown shapes).
- **Module allowlist (named constant, not ad-hoc):** `webapp_identifier`, `nuclei-router`,
  `nuclei-module`, `vcs`, `directory_index`, `mail_dns_scanner`, limited `port_scanner`.
  **Off:** all `*_bruter`, `bruter`, `subdomain_enumeration` (scope-expanding),
  `lfi_detector`/`sql_injection_detector` (slow/intrusive).

### mitre-explorer (REST `/api/v1/`, via MitreExplorerClient + cache)
- Website/Manual: resolve slug (`/applications?search=`) → app CVEs
  (`/applications/{vendor}/{product}`) → per-CVE ranges (`/cves/{id}`) → **client-side**
  `isVersionAffected`. Build a **static `config/artemis-product-map.json`** (e.g.
  `wp_scanner→wordpress/wordpress`) first, search as fallback, never silently drop (unresolved
  → Advisory).
- Packages: `/packages/{ecosystem}/{name}` (+ `/cves/{id}/packages`). **PURL→ecosystem map**
  (`deb→debian`, `apk→alpine`, `rpm→rhel`, `npm→npm`, …; OS distro from PURL namespace). OSV
  packages return no range — fine, **Trivy already gave the verdict**; mitre only enriches
  (severity/KEV/EPSS/plain-language).
- `version=` is coarse `ILIKE` (confirmed still substring after the latest mitre update) — a
  pre-filter only; the real match is ours.

### Trivy
- Org runs `trivy fs --scanners vuln --format json --output sr-report.json /`; we ingest
  `Results[].Vulnerabilities[]` → `PkgIdentifier.PURL`, `InstalledVersion`, `FixedVersion`,
  `Severity`, `VulnerabilityID`. **Untrusted input** — see security gates below.

## 6. Security & ethics — must-haves before ANY real scan (security review)

1. **Domain-ownership verification** before active scan — DNS TXT nonce / `.well-known` file /
   email-to-WHOIS-contact. Checkbox alone is rejected. Store token + method + time as evidence.
2. **Enforced allowlist gate** in the start path: scan iff `ownership_verified && domain ∈
   allowlist`. For the demo, **own test sites only** + free-text-to-scan disabled (recommended).
3. **SSRF guard:** reject bare IPs/`localhost`/non-FQDN; resolve + block RFC-1918/loopback/
   link-local/CGNAT/metadata IPs at **intake and scan time** (rebinding); egress-firewall the
   Artemis host off RFC-1918, metadata IP, and the backend subnet.
4. **Artemis safe profile pinned as code** (the allowlist above); low `REQUESTS_PER_SECOND`;
   `LOCK_SCANNED_TARGETS=true`; disclose to the LCO "this is an active scan from our IP";
   publish `security.txt` + abuse contact + identifying User-Agent.
5. **Untrusted Trivy upload:** size cap (~5–10 MB), content-type check, streaming parser with
   max-depth/array caps (reject, don't truncate), schema-validate, findings cap + dedupe.
6. **Output safety:** escape every rendered string (Trivy/mitre/manual fields), **no
   `dangerouslySetInnerHTML`**, strict CSP on the report; sanitize before PDF too.
7. **Injection-safe lookups:** URL-encode + validate (`^[a-z0-9._-]+$`/known-ecosystem) every
   mitre path segment; **parameterize all SQL** (PURL is data).
8. **Data handling:** minimize (drop raw paths/hostnames from Trivy; keep PURL+version+CVE);
   delete raw upload after parse; short retention/auto-purge; per-org access; deletion path.
9. **Secrets:** platform secret store, never in repo; gitleaks in CI; least-privilege DB user.
10. **Append-only audit** per scan: consent evidence, target, resolved IPs, module set, RPS,
    timestamps, counts.

For a 4-day demo, **own-test-sites-only** collapses items 1–3 to "pre-seed the allowlist" —
strongly recommended.

## 7. SafetyRoutes internal API
```
POST /api/scans                       # create + consent → scan_id
GET  /api/scans/{id}/status           # { status, source_status }  (frontend polls this)
POST /api/scans/{id}/trivy-upload     # multipart → upload_id
POST /api/scans/{id}/declared-software
POST /api/scans/{id}/start            # idempotent (no-op if already scanning)
GET  /api/scans/{id}/findings         # filter by source/confidence/severity
GET  /api/scans/{id}/report
```
Each source fails **independently**; the report renders whatever's available and marks the
rest (`source_status`) in plain language.

## 8. Cut to stretch / post-bootcamp
Full safety-hardening UI, Phase 7 (re-scan/reminders/trends), real PDF pipeline (use print
CSS), findings pagination, auth/multi-org (one hardcoded demo org), granular live progress
(simple spinner for the demo).

## 9. Tech stack
Next.js (App Router) + TypeScript + Tailwind + PostgreSQL; Artemis via Docker Compose; Trivy
org-run; mitre-explorer via REST (self-hosted sidecar for the demo, recommended). Matches the
mitre-explorer stack + the team's Vercel workflow.

---

## Open decisions (please answer — terse ok)

1. **Demo posture:** own test sites only (safe, recommended), or real consented LCO too?
2. **mitre-explorer for demo:** self-host a sidecar copy (you own the repo; kills rate limit), or live API + cache?
3. **Scope:** Website + Packages core, Manual as stretch (recommended)? or all three committed?
4. **Artemis host:** laptop/local, dedicated VM, or cloud VM? (Docker isn't running here yet.)
5. **Ownership-verification method** for the model: DNS TXT / `.well-known` / email?
6. **Report output:** web view only (print-to-PDF) for the demo? or build a PDF pipeline?
7. **Stack:** Next.js as above — confirm, or prefer a separate React SPA + Node API?
