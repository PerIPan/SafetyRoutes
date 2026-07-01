-- SafetyRoutes schema (idempotent). See docs/IMPLEMENTATION_PLAN.md §4.
-- Run with: npm run db:migrate

-- ── enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE scan_status AS ENUM
  ('pending','verifying','scanning','enriching','done','failed','timed_out');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE finding_source AS ENUM ('website','server','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE finding_confidence AS ENUM ('confirmed','advisory','no_issue');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE finding_severity AS ENUM ('critical','high','medium','low','info');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── organizations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── scans (one wizard run; consent folded in; sources optional 1–3) ──────────
CREATE TABLE IF NOT EXISTS scans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organizations(id),
  domain             text,                        -- null if website tier not chosen
  status             scan_status NOT NULL DEFAULT 'pending',
  -- consent (one per scan) + ownership evidence
  consent_by         text,
  consent_method     text DEFAULT 'wizard',
  consent_at         timestamptz,
  ownership_verified boolean NOT NULL DEFAULT false,
  ownership_method   text,                        -- dns-txt | well-known | email | owner-allowlist
  ownership_token    text,
  -- artemis linkage
  artemis_analysis_id text,
  artemis_tag         text,
  -- per-source status: { website|server|other: { status, message?, count? } }
  source_status      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_scans_org_id ON scans(org_id);

-- ── trivy_uploads (raw report kept for re-ingest) ────────────────────────────
CREATE TABLE IF NOT EXISTS trivy_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id         uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  filename        text,
  raw_json        jsonb NOT NULL,
  parsed_count    int,
  skipped_count   int,
  idempotency_key text,                           -- sha256(raw_json)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- per-scan (NOT global) so two scans can adopt the SAME waiting inbox report without cross-linking
  CONSTRAINT uq_trivy_upload_idem UNIQUE (scan_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_trivy_uploads_scan_id ON trivy_uploads(scan_id);

-- ── declared_software (manual tier) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS declared_software (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id    uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  vendor     text,
  product    text NOT NULL,
  version    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_declared_software_scan_id ON declared_software(scan_id);

-- ── findings (one polymorphic table; source + confidence are the backbone) ───
CREATE TABLE IF NOT EXISTS findings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id              uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  source               finding_source NOT NULL,
  confidence           finding_confidence NOT NULL,
  title                text NOT NULL,
  plain_explanation    text,
  severity             finding_severity,
  severity_plain       text,
  fix_text             text,
  cve_id               text,
  -- website
  artemis_finding_id   text,
  module               text,
  -- server
  trivy_upload_id      uuid REFERENCES trivy_uploads(id) ON DELETE SET NULL,
  purl                 text,
  package_name         text,
  ecosystem            text,
  installed_version    text,
  fixed_version        text,
  -- other
  declared_software_id uuid REFERENCES declared_software(id) ON DELETE SET NULL,
  -- enrichment + idempotency
  enrichment_status    text NOT NULL DEFAULT 'pending',   -- pending | done | unavailable
  idempotency_key      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_finding_idem UNIQUE (scan_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_findings_scan        ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_scan_source ON findings(scan_id, source);
CREATE INDEX IF NOT EXISTS idx_findings_scan_conf   ON findings(scan_id, confidence);
CREATE INDEX IF NOT EXISTS idx_findings_scan_sev    ON findings(scan_id, severity);
CREATE INDEX IF NOT EXISTS idx_findings_cve         ON findings(cve_id) WHERE cve_id IS NOT NULL;

-- ── mitre_cache (rate-limit defense for the live API) ────────────────────────
CREATE TABLE IF NOT EXISTS mitre_cache (
  cache_key     text PRIMARY KEY,                 -- "app:apache/http_server" | "cve:CVE-..." | "pkg:debian/openssl"
  response_json jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  ttl_hours     int NOT NULL DEFAULT 24
);

-- ── scan_audit (append-only; app role gets INSERT/SELECT only in prod) ───────
CREATE TABLE IF NOT EXISTS scan_audit (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id    uuid,
  event      text NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_audit_scan ON scan_audit(scan_id);

-- ── additive migrations (idempotent — safe to re-run on an existing DB) ───────
-- website scan depth chosen in the wizard (essentials | standard | thorough).
ALTER TABLE scans    ADD COLUMN IF NOT EXISTS scan_profile text NOT NULL DEFAULT 'standard';
-- per-scan token so a `curl`-piped Trivy run can POST results without a session cookie.
ALTER TABLE scans    ADD COLUMN IF NOT EXISTS upload_token text;
-- prioritization signals persisted at finding-write time (KEV-first ordering + bands).
ALTER TABLE findings ADD COLUMN IF NOT EXISTS is_kev boolean;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS epss   real;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS cvss   real;
CREATE INDEX IF NOT EXISTS idx_findings_scan_kev ON findings(scan_id, is_kev);

-- ── server-packages auto-collect: org ingest token + Trivy inbox ─────────────
-- Per-org STANDING secret the host-side Trivy collector authenticates with (Authorization: Bearer).
-- POC: stored plaintext; prod TODO: store sha256(token) + rotation (see docs/trivy-auto-collect-todo.md).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ingest_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_ingest_token
  ON organizations(ingest_token) WHERE ingest_token IS NOT NULL;

-- Append-only history of pushed Trivy reports (one row per push). "Latest per (org, source_host)"
-- is derived by received_at — keeping history lets the wizard show "report changed since last scan"
-- and lets a poisoned/empty push be detected and rolled back (security review P0-1 / P2-4).
CREATE TABLE IF NOT EXISTS trivy_inbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_host  text,                              -- collector-reported hostname (untrusted; capped/charset-checked)
  raw_json     jsonb NOT NULL,
  sha256       text NOT NULL,                     -- integrity + change-detection
  bytes        int  NOT NULL,
  result_count int,                               -- Results[].length at ingest (cheap setup-panel display)
  vuln_count   int,                               -- total vulnerabilities at ingest
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trivy_inbox_org ON trivy_inbox(org_id, received_at DESC);

-- Migrate trivy_uploads.idempotency_key from GLOBAL unique → per-scan composite (architect P0-1),
-- so two scans adopting the SAME inbox report don't cross-link each other's findings.
ALTER TABLE trivy_uploads DROP CONSTRAINT IF EXISTS trivy_uploads_idempotency_key_key;
DO $$ BEGIN
  ALTER TABLE trivy_uploads ADD CONSTRAINT uq_trivy_upload_idem UNIQUE (scan_id, idempotency_key);
-- duplicate_object = constraint name taken; duplicate_table = its backing index taken. Catch both
-- so re-running the migration is idempotent.
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;

-- Business-impact report (Gemini) + authorization/consent record.
--   authorization_snapshot: IMMUTABLE consent terms captured at scan creation; printed
--     verbatim on the authorization page — never rewritten by later edits.
--   org_context: MUTABLE prompt-conditioning (what the org does / who it serves / data held);
--     kept separate from the consent artifact so it can change without touching what was authorized.
--   business_report*: cached LLM/fallback summary; nulled by replaceSourceFindings on any re-ingest.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS authorization_snapshot jsonb;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS org_context            jsonb;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS business_report        jsonb;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS business_report_model  text;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS business_report_at     timestamptz;
