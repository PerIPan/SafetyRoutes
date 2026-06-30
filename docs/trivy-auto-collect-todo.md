# Trivy auto-collect — "Trivy waiting on the host" (TO-DO)

Goal: the org's server runs Trivy on its own schedule (cron) and **pushes** the report to
SafetyRoutes. A non-technical user runs the wizard every ~2 months → the Server step finds a fresh
report already waiting; no manual command, no manual upload.

**Locked decisions:** topology = same machine (collector curls localhost) · scan target =
`trivy fs /` · model = **push** (collector + cron), not pull.

Status: **design reviewed (architect + security), revised below. NOT yet implemented.**

---

## Review verdicts

- **Architect:** sound to build — *one mandatory change first:* fix the global-unique
  `trivy_uploads.idempotency_key` → `UNIQUE(scan_id, idempotency_key)` or two scans adopting the
  same waiting report cross-link and corrupt each other's findings. Use copy-blob adoption +
  `(org_id, source_host)` inbox grain.
- **Security:** **not safe to build as-is.** Single most important hardening: require the token in
  an `Authorization` header (not the query string) and verify it **fail-closed before
  buffering/parsing the body**, and make adoption **non-destructive** — together these stop the
  leaked-standing-token poison/hide chain that the per-scan upload's one-shot capability never had.

---

## Resolved hardening decisions (these override the original draft)

| Topic | Decision |
|---|---|
| Token carrier | `Authorization: Bearer <token>` header. **Reject** any `?token=`/`?org_token=` query param. |
| Token entropy | `randomBytes(32).toString('base64url')` (256-bit). NOT `randomUUID`. Returned once on creation; never logged. |
| Token storage | POC: plaintext column **with a risk comment**. Prod TODO: store `sha256(token)`, compare digest, add rotation. |
| Verify order | **token-verify → Content-Length cap → read body → byte cap → JSON.parse → structural validate → upsert.** No DB write on any path lacking a verified token. |
| Constant-time | Look up org by digest column (index lookup *is* the secret check) **or** by non-secret id then `safeEqual`. One identical generic `401` (same body + latency class) for absent-org / wrong-token / malformed. |
| Size cap | **≤8 MB** (match existing). Reject on `Content-Length` **before** `req.text()`; also `Buffer.byteLength`-count while reading. Reject `Content-Encoding` ≠ identity (zip-bomb). |
| Structural cap | Reject (don't truncate) at ingest if `Results` length or total vulns exceed a `MAX_RESULTS`/`MAX_VULNS` bound (downstream `MAX_TRIVY_FINDINGS=2000`, `MAX_ENRICH_CALLS=60` are NOT ingest-time guards). |
| Empty report | For **inbox** ingest, require `Results` be a non-null array — reject `{SchemaVersion}`-only. (`looksLikeTrivy` is a shape sniff, not trust.) |
| Inbox grain | **Append-only history** table (every push = immutable row: `received_at`, `source_host`, `sha256`, `bytes`). "Latest" derived per `(org_id, source_host)` by `received_at`. Lets the wizard show "report changed since last scan" + enables rollback. |
| Rate limit | Per-token + per-IP throttle (token: a few/min; IP: low) → `429 Retry-After`. **None exists in the codebase today** — add a minimal limiter. |
| `source_host` | Untrusted free text: length-cap (≤253), hostname charset only, treat as untrusted on display. |
| Adoption (P2) | **Non-destructive MERGE** (union by `idempotency_key`), NOT `replaceSourceFindings`. Treat empty/shrunken `Results` as "needs human confirmation," never an authoritative green "no issues." |
| Idempotency (P2) | **Prereq migration:** `trivy_uploads.idempotency_key` → `UNIQUE(scan_id, idempotency_key)` (mirror `uq_finding_idem`). Additive: drop old unique, add composite. |
| Audit | `audit(null, 'inbox.received', { orgId, sourceHost, sha256, bytes, accepted })` on every push (`scan_audit.scan_id` already nullable). |
| Staleness | Compute at adoption read-time from `received_at`: warn **>14d**, hard-stale **>60d** (~2-month cadence). Surface, don't silently adopt a 6-month-old blob. |

---

## Phase 0 — prerequisite migration (do first)
- [ ] `trivy_uploads.idempotency_key`: drop global `UNIQUE`, add `UNIQUE (scan_id, idempotency_key)` *(arch P0-1)*
- [ ] update the existing `trivy-upload/route.ts` `ON CONFLICT (idempotency_key)` → `ON CONFLICT (scan_id, idempotency_key)` *(arch P0-1)*

## Phase 1 — inbox + ingest endpoint + collector
- [ ] schema: `organizations.ingest_token text` (CSPRNG, populated at `ensureDemoOrg` creation — **no null window**) + risk comment *(arch P0-3, sec P1-1/P1-2)*
- [ ] schema: append-only `trivy_inbox(id, org_id, source_host, raw_json jsonb, sha256, bytes, parsed_count, received_at)`; index on `(org_id, received_at desc)` *(arch P1-1/P2-4, sec P0-1)*
- [ ] `lib/inbox.ts`: `getOrgIngestToken()` (get-or-create), `putInboxReport()` (append), `getInboxReport(orgId)` (latest per host by `received_at`) — via `query`/`queryOne`, never raw pool *(arch P2-3)*
- [ ] `POST /api/ingest/trivy` — **Bearer token**, fail-closed verify FIRST, `Content-Length` cap (≤8 MB) before read, reject non-identity `Content-Encoding`, structural caps, require non-null `Results[]`, append to inbox, audit; generic `401`; `429` on rate limit *(sec P0-1..P0-4, P1-3..P1-5)*
- [ ] minimal rate limiter (per-token + per-IP) *(sec P0-3)*
- [ ] `scripts/sr-trivy-collector.sh` + cron/launchd snippet: token from `0600` file, `Bearer` header, `--data-binary @-`, `--max-time`, HTTPS for any non-loopback hop *(sec P2-3)*
- [ ] test: curl existing `sr-trivy-report.json` at the endpoint with a valid Bearer token

## Phase 2 — wizard auto-adoption
- [ ] Server step: `getInboxReport` → if waiting, **copy** blob into a per-scan `trivy_uploads` row (snapshot, not by-reference) → run packages tier *(arch P0-2/P1-4)*
- [ ] adoption is **non-destructive merge** (union by `idempotency_key`); empty/shrunken `Results` ⇒ "needs confirmation", not all-clear *(sec P0-1)*
- [ ] staleness surfaced (warn >14d / hard-stale >60d); "report changed since last scan" if sha256 differs *(arch P1-2, sec P2-4)*
- [ ] no-report-waiting path → fall back to existing manual per-scan upload *(arch P1-3)*
- [ ] card: "Latest server report received X ago ✓ — using it"

## Phase 3 — setup UX + docs
- [ ] "Connect your server" panel: org ingest token (shown once) + copy-paste install snippet
- [ ] **update README**: "Automatic server scanning — install the Trivy collector once" (Bearer/0600 hygiene, HTTPS note, cadence)

---

## Open questions (concise)
- rate-limit store: in-memory (per-process, resets on restart) vs a `rate_limit` table — POC default in-memory?
- inbox retention: cap history rows per org (e.g. keep last 20) or unbounded for POC?
- merge semantics for adoption: drop findings absent from the newest report, or keep until a human confirms? (leaning keep + flag)
- show token in-app once (Phase 3) vs README/manual provisioning only for the POC?
