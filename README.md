# SafetyRoutes

A vulnerability scanning tool for identifying security weaknesses across applications and infrastructure.

> **Status:** working build — a selection-first wizard with the Website (Artemis + `nuclei -as`),
> Server-packages (Trivy, auto-collected or uploaded), and Other-software (MITRE Explorer) tiers,
> plus a built-in DVWA test target. Built for the Ransomware Defence Summer Bootcamp.

## In plain words

Think of SafetyRoutes as a friendly **health check-up for your organization's website**.

Many small charities, non-profits, and small businesses (we call them *local community
organizations*) don't have a tech team — but they're still targets for ransomware and
other online attacks. The weak spots are often simple things left open by accident, like
an unlocked back door, that criminals can find automatically.

With the organization's permission, SafetyRoutes looks over their website for these common
weak spots and then explains what it found in **everyday language**: what the problem is,
why it matters, and the simple steps to fix it. Later, it checks again to confirm the fix
worked, and sends a gentle reminder if anything is still open.

Behind the scenes it uses trusted, free security tools. **Artemis** (with **Nuclei** built in)
checks the website, **Trivy** checks the packages on a server, and a threat-intelligence
database called **MITRE Explorer** connects the software an organization runs to the security
flaws known to affect it. We only ever scan organizations that have asked us to, and we do it
carefully so nothing breaks.

The goal is simple: help the organizations that protect our communities lower their risk —
without needing to be security experts themselves.

---

## RANSOMWARE DEFENCE SUMMER BOOTCAMP
*by Virtual Routes — @ Amsterdam Business School, 29 June – 3 July 2026*

### Decreasing Exposure Through Vulnerability Scanning

Design and develop a basic vulnerability scanning pipeline, focusing on vulnerabilities
that are common for Local Community Organizations (LCOs), such as SMEs or non-profits.
The sessions will help participants understand what vulnerability scanning is exactly,
how to conduct scans responsibly, how this helps to protect organizations, and how such
information should be communicated with a non-technical audience to stimulate awareness
and action.

**The sessions should:**

- Focus on common risks and vulnerabilities among Local Community Organizations
- Adhere to the ethical guidelines that correspond with good-faith security research
- Minimize the risks associated with vulnerability scanning
- Communicate findings in a clear and comprehensible manner
- Focus on automation and scale

**Suggestions for achieving higher impact:**

- Use CERT-PL's Artemis framework to set up automated scanning
- Select scanning modules based on open-source threat landscapes for NGOs
- Find a middle ground between technical details and actionable information
- Develop a way to confirm remediation of a vulnerability and send reminders

---

## Overview

SafetyRoutes is a **Next.js + PostgreSQL** app that wraps three trusted, free security tools
behind one guided wizard built for non-technical organizations: **Artemis** (+ Nuclei) checks
the website, **Trivy** checks a server's packages, and **MITRE Explorer** connects the software
an org runs to the flaws known to affect it. Three inputs → one plain-language, source-tagged
report, led by an **AI business-impact summary** (Google Gemini) written from the findings and
tailored to the organization. We only ever scan organizations that have asked us to.

## Scanning engine: Artemis

SafetyRoutes plans to automate scanning on top of
[**Artemis**](https://github.com/CERT-Polska/Artemis), the modular vulnerability scanner
built and maintained by [CERT Polska](https://cert.pl/) (CERT PL).

- **What it is:** a modular web vulnerability scanner with automatic, human-readable
  report generation. CERT PL uses it to scan and notify organizations about
  vulnerabilities at scale (hundreds of thousands reported).
- **How it works:** multiple scanning modules check different aspects of a target
  (e.g. exposed `.git` directories, outdated software such as old CMS installations,
  and other web security issues), with a web UI for managing and viewing scans.
- **Extensible:** a modular architecture allows custom modules, which is how we intend
  to extend it for SafetyRoutes' use cases.
- **Targeted CVE checks (`nuclei -as`):** rather than run
  [**Nuclei**](https://github.com/projectdiscovery/nuclei)'s full **13,320-template** library
  (slow, and it times out on CDN/PaaS hosts), we run it in **automatic-scan** mode — fingerprint
  the site's stack (wappalyzer) and run only the templates that match it (tens, not thousands).
  This runs as a decoupled step in the app, not as an Artemis module — see
  *"What we scan — and what we don't"* below.
- **Deployment:** runs via Docker and Docker Compose (development mode via
  `./scripts/start --mode=development`).
- **License:** BSD-3-Clause.

> **Note:** Artemis is experimental software under active development — use at your own
> risk, and only against systems you are authorized to scan.

## What we scan — and what we don't

Artemis ships **34 toggleable modules**. SafetyRoutes enables a **deliberately small,
LCO-focused** subset — the checks that matter for a Local Community Organization — plus a
targeted vulnerability scan. The depth selector adds breadth, not intrusiveness.

**What we keep:**

| Check | Artemis module | Depth | Why it matters to an LCO |
|---|---|---|---|
| Open ports | `port_scanner` | all | Attack surface |
| Exposed `.git` / source control | `vcs` | all | Leaks source code & secrets |
| Exposed folder listings | `directory_index` | all | Accidental file exposure |
| `robots.txt` disclosure | `robots` | all | Information leakage |
| HTTP security headers | `humble` | all | Easy, high-value hardening |
| Email impersonation (SPF/DMARC) | `mail_dns_scanner` | Standard + | Charities get spoofed |
| Domain expiry | `domain_expiration_scanner` | Standard + | A forgotten renewal loses the domain |
| Deeper DNS / takeover risk | `dns_scanner`, `dangling_dns_detector` | Thorough | Zone transfer, dangling records |
| Known vulnerabilities | **`nuclei -as`** (decoupled — `web/lib/nuclei-scan.ts`) | all | Fingerprints the site, runs only matching templates |

**What we leave out — and why:**

- **Brute-forcers** — `ftp_bruter`, `ssh_bruter`, `mysql_bruter`, `postgresql_bruter`,
  `wordpress_bruter`, `admin_panel_login_bruter`, `bruter`. Slow, noisy, DoS-prone, and they
  need exposed SSH/FTP/DB ports a charity website doesn't have.
- **Active injectors** — `sql_injection_detector`, `lfi_detector`, `orm_injection_detector`,
  `api_scanner`. Redundant here — the `nuclei -as` step covers web vulnerabilities more cleanly.
- **Artemis's bundled Nuclei** — `nuclei-module` / `nuclei-router`. Running its full
  **13,320-template** library is slow and times out on CDN/PaaS hosts; replaced by the targeted
  `-as` step above.

Because Artemis treats `enabled_modules` as a **whitelist**, everything not in the table is off
by default — so the brute-forcers and injectors never run.

## Guided wizard

Most LCOs don't know which security checks they need. The **wizard** opens by letting them
**pick which of the three checks to run**, then walks the chosen ones in order — **website**
first (Artemis + a targeted `nuclei -as` scan — tracks 1–2 below), then **other software**
(type product + version — track 4), and **server packages** last (a Trivy report, pushed
automatically by a collector or uploaded by hand — track 3). Each maps to a different tool and a
different confidence level:

### 1. Applications & their CVEs

- Artemis **fingerprints the software** a site runs (and its **version where possible**) via the
  always-on `webapp_identifier`, plus `port_scanner` for exposed services.
- Each detected app is looked up in [**mitre-explorer.org**](https://mitre-explorer.org),
  which links 11K+ products to their known CVEs (prioritized with CISA KEV and EPSS). It
  returns the app's **full** CVE list with per-CVE version ranges; **we then keep only the
  CVEs that affect the detected version, matching on our side** (mitre-explorer has no
  version filter of its own). If a version can't be determined, the report says so rather
  than guessing.
- A decoupled **`nuclei -as`** step (`web/lib/nuclei-scan.ts`) fingerprints the site and runs
  only the templates matching its stack to actively test for known vulnerabilities. Artemis's
  own bundled Nuclei modules are deliberately **off** (see *"What we scan"*).
- Each relevant CVE is reported in one of three clear states:
  - **Confirmed** — the scan actively verified it.
  - **Possible — needs manual check** — known to affect the detected app/version but not
    safely testable remotely. (*Not* a clean bill of health.)
  - **No issue found** — checked and nothing detected.

### 2. Web scanning

- Exposed files, misconfigurations, and hygiene: `vcs` (exposed `.git`), `directory_index`
  (open folder listings), `robots` (robots.txt disclosure), and `humble` (HTTP security
  headers) — plus the targeted `nuclei -as` vulnerability scan above. Brute-forcers and active
  injectors stay **off** (see *"What we scan — and what we don't"*).

### 3. Server packages (Trivy)

For installed OS and library packages on a Linux server — which a remote scan **can't see** —
**Trivy** runs on the server itself. A small collector can **push** its report on a schedule so
it's already waiting at scan time (see *"Automatic server scanning"*), or the org can run it by
hand and upload the file:

```
trivy fs --scanners vuln --format json --output sr-report.json /
```

We read each finding by **PURL** (e.g. `pkg:deb/debian/openssl`) with its installed version,
fixed version, and CVE, then enrich via mitre-explorer's **`/packages`** knowledgebase
(severity, KEV/EPSS, ATT&CK technique, plain language). Trivy already does the version
verdict, so these are **Confirmed**. Trivy and mitre-explorer share the same ecosystems
(npm, PyPI, Go, Maven, RubyGems, NuGet, Composer; Debian/Ubuntu/Alpine/RHEL via OSV).

### 4. Other software (manual / advisory)

For desktop or office software no scanner can reach (Office, Acrobat, …), the org
self-declares **product + version**. We match it in mitre-explorer's Applications data and
list the known CVEs as **Advisory — verify locally** — never *Confirmed*, since nothing was
actively scanned.

Three inputs, one report — **Website** (Artemis + Nuclei), **Server packages** (Trivy), and
**Other software** (manual). Intrusive Artemis modules stay off by default.

## How it works — step by step

The wizard first lets the org **choose which of the three checks to run** and collects their
inputs; the tools run afterwards, then everything merges into one **source-tagged** report.

```mermaid
flowchart TD
    A(["Org opts in — consent recorded"]) --> B["Wizard: choose which checks + provide inputs"]
    B --> W["Website — your domain (or built-in DVWA)"]
    B --> P["Server packages — Trivy report (auto-collected or uploaded)"]
    B --> O["Other software — type product + version"]
    W --> W2["Artemis hygiene + decoupled nuclei -as: fingerprint, test known issues"]
    P --> P2["Read Trivy by PURL: installed + fixed version + CVE"]
    O --> O2["Match product + version in MITRE Explorer Applications"]
    W2 --> X["Enrich + prioritize in MITRE Explorer<br/>CVEs, KEV/EPSS, plain language"]
    P2 --> X
    O2 --> X
    X --> R["One report, source-tagged<br/>Confirmed (Website, Server) · Advisory (Other) · No issue"]
    R --> C["Deterministic classifier ranks and selects the top findings"]
    B -. org details .-> G
    W -. short profile from the org's own website .-> G
    C --> G["Google Gemini writes a plain-language<br/>business-impact summary — grounded in findings,<br/>template fallback if unavailable"]
    G --> T["Business-impact summary shown at the top of the report"]

    classDef start  fill:#E2F1F0,stroke:#0E9CA5,color:#0B3B40,stroke-width:1.5px;
    classDef input  fill:#F1FAFA,stroke:#0E9CA5,color:#0B3B40;
    classDef process fill:#FFFFFF,stroke:#9BB7BB,color:#33454A;
    classDef enrich fill:#FBF0E0,stroke:#A6690F,color:#6B430A;
    classDef report fill:#EEF2F1,stroke:#5C7A80,color:#25343A,stroke-width:1.5px;
    classDef ai     fill:#EAF0FF,stroke:#3B6FB6,color:#1E3A5F,stroke-width:1.5px;

    class A start;
    class B,W,P,O input;
    class W2,P2,O2 process;
    class X enrich;
    class R report;
    class C,G,T ai;
```

1. **Opt in** — the organization gives permission; we record consent.
2. **Choose which checks + give inputs** — a domain (or the built-in DVWA target), a Trivy
   report (auto-collected or uploaded), and/or a product+version list.
3. **Website** → Artemis runs hygiene checks (`vcs`, `directory_index`, `robots`, `humble`,
   `mail_dns_scanner`) while a decoupled **`nuclei -as`** step fingerprints the site and tests for
   known vulnerabilities.
4. **Server packages** → we read the Trivy report by **PURL** (installed + fixed version + CVE).
5. **Other software** → we match each declared product + version in MITRE Explorer.
6. **Enrich** → MITRE Explorer adds CVE detail, KEV/EPSS priority, and plain-language context.
7. **Report** → one source-tagged report: **Confirmed** (Website, Server) · **Advisory** (Other,
   verify locally) · **No issue found**.
8. **Business-impact summary** → a deterministic classifier ranks the findings, then **Google
   Gemini** writes a plain-language summary at the top of the report — grounded in the findings and
   tailored with the org details from the wizard plus a short profile derived from the org's own
   website (a deterministic template is used if the AI is unavailable).

## The app

The wizard walks through a **five-step guided check**, then merges everything into one
source-tagged, plain-language report topped by an **AI business-impact summary** (Google Gemini) —
grounded in the findings, tailored with the org details from the wizard and a short profile
auto-derived from the org's own website, with a deterministic template as fallback.

**1 · What to check** — pick any of the three checks; optionally add a few words about your
organization so the summary can be tailored to the people you serve.

![What to check](docs/screenshots/01-what-to-check.png)

**2 · Website** — a read-only **Artemis + Nuclei** scan of a site you're authorized to test, with a
scan-depth choice (Essentials / Standard / Thorough).

![Website step](docs/screenshots/03-website.png)

**3 · Other software** — vendor / product / version, matched in **MITRE Explorer** and flagged
**Advisory — verify locally**.

![Other software step](docs/screenshots/05-other-software.png)

**4 · Server packages** — the collector's **Trivy** report, usually already waiting (or upload one).

![Server packages step](docs/screenshots/06-server-packages.png)

**5 · Run the check** — a plain summary of everything you provided.

![Run the check](docs/screenshots/07-run.png)

**Your report** — one source-tagged report (**Confirmed** · **Advisory — verify** · **No issue
found**), led by the plain-language business-impact summary.

![Report](docs/screenshots/08-report.png)

Findings are **source-tagged and filterable**, each explained in plain language with a concrete fix:

![Findings](docs/screenshots/10-findings.png)

Every step carries a **"How this step works"** explainer, and the website step opens a side-by-side
scan-depth comparison:

![Step explainer](docs/screenshots/02-help-modal.png)
![Scan-depth help](docs/screenshots/04-scan-depth-help.png)

The **executive summary** up close — written by Gemini, grounded in the findings, with a
deterministic fallback:

![Executive summary](docs/screenshots/09-executive-summary.png)

## CVE data — the mitre-explorer API

mitre-explorer is the knowledge layer for **both** the Applications tier (web-facing apps +
declared software → CVEs) **and** the Packages tier (Trivy findings → advisories). 11K+
products → 26K+ CVEs, plus ~12.8K packages → 32.5K GHSA + 489K OSV advisories, enriched with
CISA KEV and EPSS. Base URL: `https://mitre-explorer.org`.

**Lookup flow (three calls):**

1. **Resolve product → slug** — `GET /api/v1/applications?search={name}` returns matches
   with a `normalized` slug (e.g. `apache/http_server`), `vendor`, and `product`. The
   detail call needs this exact slug.
2. **Get the app's CVEs** — `GET /api/v1/applications/{vendor}/{product}` returns the app
   plus a paginated `cves[]` array (`cveId`, `cvssSeverity`, `isKev`, `publishedAt`, …).
3. **Get version ranges per CVE** — `GET /api/v1/cves/{cveId}` returns
   `affectedApps[].versionStart` / `versionEnd`. **Match the detected version here, on our
   side** — this range check is the source of truth for what's actually affected.

**Endpoints:**

| Endpoint | Purpose | Key params | Version filter? |
|---|---|---|---|
| `GET /api/v1/applications` | Search apps / resolve slug | `search`, `vendor`, `version`\*, `page`, `limit`, `sort` | Coarse\* (needs `search`/`vendor`) |
| `GET /api/v1/applications/{vendor}/{product}` | An app + its CVEs | path slug `^[a-z0-9/]+$`, `version`\*, `page`, `limit` | Coarse\* |
| `GET /api/v1/cves` | CVE list, filter by app name | `app` (substring), `version`\*, `severity`, `since`, `technique` | Coarse\* (needs `app`) |
| `GET /api/v1/cves/{cveId}` | Full CVE incl. version ranges | path `CVE-YYYY-NNNN`, `version`\* | Returns ranges; `version`\* narrows |
| `GET /api/v1/packages` | Search packages (Trivy tier) | `ecosystem`, `q`, `page`, `limit` | — |
| `GET /api/v1/packages/{ecosystem}/{name}` | A package + its advisories (GHSA + OSV) | path `ecosystem`/`name`, `version`\* | GHSA returns `vulnerableRange`/`fixedVersion`; `version`\* narrows |
| `GET /api/v1/cves/{cveId}/packages` | Packages affected by a CVE | path `CVE-YYYY-NNNN` | — |
| `POST /api/a2a` | JSON-RPC skills: `get_application_security`, `search_applications`, `search_cves`, `get_cve_detail` | per skill (+ `version`\*) | Coarse\* |

\* `version` is an optional, non-breaking param — a coarse **substring** match on the stored
version boundaries, **not** a semantic "is this version in range" check (see gotchas).
Pending deploy of mitre-explorer.

**Gotchas (verified against the mitre-explorer source):**

- **`version=` is a coarse pre-filter, not a verdict.** The optional `version` param does a
  **substring** match on `version_start`/`version_end` (so `2.5` also matches `12.5.1`, and
  misses a `2.0`–`3.0` range that contains 2.5). Use it to shrink results, then **do the real
  version-range match client-side** — that stays the source of truth. (CPE is still not
  filterable.)
- The `?app=` filter is a substring (ILIKE) match and **over-matches** (e.g. `http` hits
  many products) — prefer the slug route for accuracy.
- Newly-published CVEs may show an empty `affectedApps` until NVD CPE enrichment lands
  (can take days), so very recent CVEs may not map to an app yet.
- The A2A endpoint is **rate-limited (~50 requests/day/IP, no auth)** — fine for a demo,
  not for bulk lookups.

**Packages lookup (Trivy tier):** join Trivy findings by **PURL** or `(ecosystem,
package_name)`. The KB spans Trivy's ecosystems (npm, PyPI, Go, Maven, RubyGems, NuGet,
Composer; Debian/Ubuntu/Alpine/RHEL via OSV). **GHSA** (language) packages return
`vulnerableRange` + `fixedVersion`; **OSV** (OS-distro) packages do **not** surface ranges
here — which is fine, because **Trivy already produces the installed/fixed-version verdict**;
mitre-explorer enriches by ID (severity, KEV/EPSS, ATT&CK technique, plain language).

## Proposed approach

> _Draft proposal for the bootcamp challenge — open to revision._

The challenge is dual-natured: build a **basic, automated** scanning pipeline for
low-capacity organizations (SMEs, non-profits), **and** run it **responsibly** while
communicating results to **non-technical** audiences. Success is not "most findings" —
it is *decreasing exposure at scale, ethically, with remediation that actually happens*.
Artemis fits because CERT PL built it for exactly this: scan → auto-report → notify
organizations at scale. The four proposals below map to the challenge goals.

### 1. Artemis scanning pipeline (the technical core)

- Run **Artemis via Docker Compose** as the scanning engine.
- Define an **"LCO module profile"** — enable only safe, relevant, low-impact modules
  (e.g. exposed `.git`/backups, outdated CMS, open admin panels, missing security
  headers, exposed services); disable aggressive or brute-force modules.
- **Consented target intake**: domains come from an allowlist (config/CSV) only after
  ownership/permission is recorded.
- **Orchestration**: scheduled scans with throttling/rate limits to minimize impact.

### 2. Responsible-scanning safeguards (good-faith research)

- **Authorization gate**: scan only domains with recorded consent.
- **Low-impact guardrails**: passive/non-intrusive checks, no exploitation, no DoS,
  rate limiting, defined scan windows, a published abuse/contact point.
- **Scope control**: allowlist + out-of-scope blocklist; honor `security.txt` where present.
- **Audit trail**: log what was scanned, when, and with which modules.

### 3. Plain-language reporting (non-technical audiences)

- A **plain-language business-impact summary** at the top of the report, written by **Google
  Gemini** from the findings (grounded — no invented figures, losses, or compliance claims) and
  tailored with the org's own details plus a short profile auto-derived from its website; a
  deterministic template is used when the AI is unavailable. Below it: source-tagged findings with
  a prioritized "what to do" action list.
- Express severity in **plain language** ("anyone on the internet can read your internal
  files") rather than CVSS jargon.
- Per-finding remediation steps sized to an LCO's capacity.

### 4. Remediation confirmation & reminders (lasting impact)

- **Re-scan** to verify a finding is fixed, then mark it resolved.
- **Automated reminders/nudges** for findings that stay open.
- **Track exposure over time** to show progress — directly serving "Decreasing Exposure."

## Roadmap (bootcamp)

- [x] Stand up Artemis via Docker Compose
- [x] Run a test scan on a consented site; inspect the real fingerprint/version output
- [x] Wizard: pick which checks to run → LCO-focused Artemis modules + decoupled `nuclei -as`
- [x] Join detected app + version to **mitre-explorer** CVE data (matched client-side)
- [x] Server-packages tier (Trivy) — automatic collector push **and** manual upload
- [x] Other-software tier — manual product + version → MITRE Explorer (Advisory)
- [x] Built-in **DVWA** test target with an active demo scan (Confirmed findings)
- [x] Plain-language, source-tagged report with the three states + remediation steps
- [x] **AI business-impact summary** (Google Gemini): a deterministic classifier ranks the findings,
      Gemini writes a grounded plain-language summary tailored by org details + the org's own website,
      with a deterministic template fallback
- [ ] _(stretch)_ Re-scan to confirm fixes and send reminders

## Quick start

Fastest path to a running app with a **sample report** — no Artemis or API key needed:

```bash
git clone https://github.com/PerIPan/SafetyRoutes && cd SafetyRoutes
docker compose -f infra/docker-compose.yml up -d db     # bundled Postgres 16 on :5433
cd web && npm install
printf 'DATABASE_URL=postgres://safetyroutes:safetyroutes@localhost:5433/safetyroutes\n' > .env.local
npm run db:migrate                                       # apply schema (idempotent)
npm run db:seed                                          # sample data
npm run dev                                              # http://localhost:3000
```

Open **http://localhost:3000/demo** for a seeded report (the AI summary falls back to the built-in
template until you add `GEMINI_API_KEY`). To run **real checks**, add `GEMINI_API_KEY` and set up
Artemis — see *"Getting started"* and *"Setting up the scanner"* below.

## Getting started

The app lives in [`web/`](web) (Next.js + PostgreSQL). The website tier needs a running
**Artemis** (Docker Compose); **Trivy** is not installed here — it runs on the server you're
checking and its report is pushed by the collector or uploaded by hand (see *"Automatic server
scanning"*).

**Prerequisites:** **Node.js 20 LTS or newer** (Node 18 is past end-of-life), **Docker** with the
**Compose v2** plugin (see *"Setting up the scanner"* below), and **PostgreSQL 16** — either the
bundled container (`docker compose -f infra/docker-compose.yml up -d db`, which listens on
`localhost:5433`) or your own local Postgres.

```bash
cd web
npm install
docker compose -f ../infra/docker-compose.yml up -d db   # bundled Postgres on :5433 (skip if you use your own)
# create web/.env.local with:
#   DATABASE_URL=postgres://…@localhost:5433/safetyroutes
#   ARTEMIS_API_URL=http://localhost:5001      # the Artemis you set up below
#   ARTEMIS_API_TOKEN=…                         # from Artemis's .env (API_TOKEN)
#   MITRE_BASE_URL=https://mitre-explorer.org
#   SCAN_ALLOWLIST=example.org,test.org         # domains you're authorized to scan (CSV)
#   # SCAN_ALLOW_ANY=true                        # dev-only: bypass the allowlist for any consented target
#   GEMINI_API_KEY=…                             # enables the AI business-impact summary (else a template is used)
#   # GEMINI_MODEL=gemini-flash-latest            # optional model override
npm run db:migrate     # apply web/db/schema.sql (idempotent)
npm run db:seed        # optional — sample report at /demo
npm run dev            # http://localhost:3000
```

## Setting up the scanner (Docker + Artemis)

The website tier needs **Artemis** running locally via Docker. On a fresh machine:

**1 — Install Docker** (Engine 24+ / Docker Desktop 4.x) **with the Compose v2 plugin** — every
command here uses `docker compose`, not the legacy `docker-compose`.

- **macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), or the lighter
  [Colima](https://github.com/abiosoft/colima): `brew install colima docker && colima start --memory 8`
- **Linux:** [Docker Engine](https://docs.docker.com/engine/install/) + the `docker-compose-plugin` package
- **Windows:** Docker Desktop (WSL2 backend)

Verify both: `docker run --rm hello-world` and `docker compose version`.

**Resources.** The Artemis stack (Karton workers + Redis + its own Postgres + a nuclei container) is
the heavy part — give Docker **≥ 8 GB RAM** and **~10 GB free disk** (images + the ~13 K nuclei
templates + vulnerability DBs). It will run with less, but scans crawl and workers can get
OOM-killed. On Colima/Docker Desktop, size the VM to match (`colima start --memory 8`, or Docker
Desktop → Settings → Resources).

**2 — Get and start Artemis**

```bash
git clone https://github.com/CERT-Polska/Artemis && cd Artemis
cp env.example .env
# edit .env and set (at minimum):
#   FRONTEND_USERNAME=admin          # required, or it won't start
#   FRONTEND_PASSWORD=<choose one>
#   API_TOKEN=<note this value>      # SafetyRoutes uses it below
./scripts/start --mode=development   # builds + starts the Karton modules via Docker Compose
```

First run pulls images and the ~13 K nuclei templates — give it a few minutes. The Artemis UI
is then at **http://localhost:5001** (log in with the `FRONTEND_*` creds). Confirm the workers are
up: `docker ps | grep karton`.

**3 — Point SafetyRoutes at it** — in `web/.env.local`:

```
ARTEMIS_API_URL=http://localhost:5001
ARTEMIS_API_TOKEN=<the API_TOKEN from Artemis's .env>
```

> **Note:** the website vuln scan runs `nuclei -as` via `docker exec` on Artemis's nuclei
> container (default `artemis-karton-nuclei-1`), so SafetyRoutes must run on the **same host**
> with Docker access. If your container name differs, set `NUCLEI_CONTAINER` (and `DOCKER_BIN`
> if `docker` isn't at `/opt/homebrew/bin/docker`) in `web/.env.local`.

**Ports used** (make sure they're free before starting): `3000` app · `5433` bundled Postgres ·
`5001` Artemis UI + API · `4280` the DVWA test target. Artemis's Karton workers and Redis stay on
its own internal Docker network.

**Built-in test target (DVWA).** The wizard's website step has a "use the built-in DVWA test site"
checkbox — [DVWA](https://github.com/digininja/DVWA) is a deliberately-vulnerable demo app, so you
can see what real findings look like. DVWA needs **two** containers (the app + its database) on the
scanner's Docker network so the nuclei container can reach it by name:

```bash
# 1 — database for DVWA, on the same network as the scanner
docker run -d --name dvwa-db --network artemis_default \
  -e MYSQL_ROOT_PASSWORD=dvwa -e MYSQL_DATABASE=dvwa \
  -e MYSQL_USER=dvwa -e MYSQL_PASSWORD='p@ssw0rd' mariadb:10

# 2 — DVWA itself, pointed at that database, published on localhost:4280
docker run -d --name dvwa --network artemis_default -e DB_SERVER=dvwa-db \
  -p 127.0.0.1:4280:80 ghcr.io/digininja/dvwa:latest
```

> Run DVWA standalone (no `dvwa-db`) and every page dies with `mysqli … Connection refused` — that
> empty result is the #1 DVWA gotcha. Give MariaDB ~20 s to start before the first scan.

DVWA is reachable **in-container** at `http://dvwa` (what nuclei uses) and on the **host** at
`http://127.0.0.1:4280` (what the active demo uses — set `DVWA_HOST_URL` to change it). Because
DVWA's lessons are auth-gated, ticking the box runs an **active demo scan** (`lib/dvwa-scan.ts`): it
logs in as `admin/password`, creates/seeds the DB, sets the security level to *low*, and confirms
DVWA's signature flaws — SQL injection, OS command injection, reflected XSS, file inclusion, and the
default admin password — as **Confirmed** findings. This active testing runs **only** against the
bundled DVWA host.

The scanner allows this one internal host by design (`INTERNAL_SCAN_HOSTS`, default `dvwa`) — it
bypasses the allowlist + SSRF guard, so keep it set to your own test containers only, and unset it on
any deployed instance.

## Automatic server scanning (Trivy collector)

The **Server packages** check doesn't need anyone to run a command at scan time. A small collector
runs Trivy on a server you own, on a schedule, and **pushes** the report to SafetyRoutes — so a
fresh report is already waiting when someone runs the wizard. Execution stays on your host; only the
JSON report is sent.

**1 — Get your ingest token.** In the wizard's **Server packages** step, open *"Connect your server
(one-time setup)"* — it shows your organization's token and the exact push command.

**2 — Install the collector once** (on the server, as the user that will run it):

```bash
sudo mkdir -p /etc/safetyroutes
printf '%s' 'YOUR-INGEST-TOKEN' | sudo tee /etc/safetyroutes/ingest.token >/dev/null
sudo chmod 600 /etc/safetyroutes/ingest.token          # the token is a standing secret — keep it 0600
sudo install -m 755 scripts/sr-trivy-collector.sh /opt/safetyroutes/sr-trivy-collector.sh
# test it:
SR_ENDPOINT=http://localhost:3000/api/ingest/trivy /opt/safetyroutes/sr-trivy-collector.sh
```

The collector uses a native `trivy` if present, else the official Docker image. The token is sent in
an `Authorization: Bearer` header (never the URL — it would leak via `ps`/logs), and you should use
**https** for any non-loopback hop.

**3 — Schedule it** (weekly, Mondays 03:00) — `crontab -e`:

```
0 3 * * 1  SR_ENDPOINT=http://localhost:3000/api/ingest/trivy /opt/safetyroutes/sr-trivy-collector.sh >> /var/log/sr-collector.log 2>&1
```

The ingest endpoint is fail-closed (valid token required, verified before the body is read),
caps the upload at 8 MB, rate-limits per token/IP, and stores an append-only history of pushes.
When a user runs the wizard with **Server packages** selected, it adopts the latest waiting report
automatically — or they can still upload a `trivy fs` report file by hand.

## Monitoring during the POC

Everything runs locally, so you can watch each moving part while a check is in flight.

| Piece | Watch it at |
|-------|-------------|
| **SafetyRoutes app** | `http://localhost:3000` — the report page (`/report/<id>`) updates live as each source finishes; the `npm run dev` terminal logs every tier and audit event |
| **Artemis** (website engine) | Its own web UI at **`http://localhost:5001`** (log in with your `FRONTEND_*` creds) — watch analyses and per-task progress in real time |
| **Karton workers** (under Artemis) | `docker ps \| grep karton` to confirm they're up; `docker logs -f <container>` to tail a module |
| **Trivy** | Collector-driven — watch the collector log (`/var/log/sr-collector.log`) and `GET /api/inbox/status` (is a report waiting). If you run `trivy server`, `curl <host>:4954/healthz` and `/version` |
| **Postgres** (app DB) | The live tables: `scans`, `findings`, `scan_audit`, `trivy_inbox`, `mitre_cache` |
| **Gemini summary** | No dashboard — see the `scan_audit` events (`business_report_generated` / `business_report_fallback`) and the dev-server log; API usage/quota in Google AI Studio |

App endpoints you can `curl` (all local):

```bash
curl -s localhost:3000/api/scans/<id>                  # scan + per-source status (what the page polls)
curl -s localhost:3000/api/scans/<id>/findings         # findings as ingested
curl -s localhost:3000/api/scans/<id>/business-report  # cached AI summary (null until first view)
curl -s localhost:3000/api/inbox/status                # is a pushed Trivy report waiting
```

Tail the audit trail — every scan / enrich / report event lands in `scan_audit`:

```bash
psql "$DATABASE_URL" -c \
  "SELECT created_at, event, detail FROM scan_audit ORDER BY created_at DESC LIMIT 20;"
```

The app DB is the Compose `db` on `:5433` (or whatever `DATABASE_URL` points at). Trivy itself has
**no results dashboard** — the report page and `scan_audit` are the closest thing; Artemis's `:5001`
UI is where you watch the website scan actually run.

## Responsible use

SafetyRoutes is intended for **authorized security testing only**. Scan only systems you
own or have explicit written permission to test. Unauthorized scanning may be illegal.

## License

To be determined.
