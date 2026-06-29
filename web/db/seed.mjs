// Seed a demo-safe scan + report (all 3 sources, all 3 confidences). Idempotent.
// Run: npm run db:seed  → prints the demo scan id.
import { createHash } from 'node:crypto';
import pg from 'pg';
import { config } from 'dotenv';
config({ path: '.env.local' });

const DEMO_DOMAIN = 'harbourtrust.org';
const idem = (...p) => createHash('sha256').update(p.join('|')).digest('hex');

const FINDINGS = [
  // website — confirmed
  ['website', 'confirmed', 'Your hidden .git folder is readable by anyone', 'high',
    'High — important to fix soon', 'It can leak passwords and your site’s source code.',
    'Block public access to the .git folder in your web server.', null, 'vcs'],
  ['website', 'confirmed', 'WordPress 6.1 has known security holes', 'high',
    'High — important to fix soon', 'Attackers actively target this version.',
    'Update WordPress to 6.5 or newer.', 'CVE-2023-2745', 'nuclei-module'],
  // server — confirmed (from a real Trivy scan)
  ['server', 'confirmed', 'libssl3 3.5.1 has a known vulnerability', 'critical',
    'Critical — fix as soon as you can', 'A flaw in the SSL library used by your server.',
    'Update libssl3 to 3.5.5 (or newer).', 'CVE-2026-31789', null],
  ['server', 'confirmed', 'curl 8.14 has a known vulnerability', 'high',
    'High — important to fix soon', 'The data-transfer tool on your server is out of date.',
    'Update curl to the patched version.', 'CVE-2025-9086', null],
  ['server', 'confirmed', 'setuptools 65.5 has a known vulnerability', 'medium',
    'Medium — worth fixing', 'A Python packaging tool on your server is affected.',
    'Update setuptools to 78.1.1 (or newer).', 'CVE-2025-47273', null],
  // other — advisory (manual)
  ['other', 'advisory', 'Microsoft Office LTSC 2024 — 92 known issues for this version', 'high',
    'High — important to fix soon', 'We can’t see your devices, so we couldn’t confirm this.',
    'Please confirm Office auto-updates are turned on.', null, null],
  // website — no issue (positive)
  ['website', 'no_issue', 'Your email protection (SPF & DMARC) is set up correctly', 'info',
    'Informational', 'This makes it harder for someone to send fake email as your charity.',
    'Nothing to do here.', null, 'mail_dns_scanner'],
];

const SERVER_PKG = {
  'libssl3 3.5.1 has a known vulnerability': ['pkg:deb/debian/libssl3@3.5.1-1+deb13u1', 'libssl3', 'debian', '3.5.1-1+deb13u1', '3.5.5-1~deb13u2'],
  'curl 8.14 has a known vulnerability': ['pkg:deb/debian/curl@8.14.1-2', 'curl', 'debian', '8.14.1-2', '8.14.1-2+deb13u1'],
  'setuptools 65.5 has a known vulnerability': ['pkg:pypi/setuptools@65.5.1', 'setuptools', 'pypi', '65.5.1', '78.1.1'],
};

const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const org = (await client.query(
    `INSERT INTO organizations (name) SELECT 'Demo organization'
       WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name='Demo organization')
     RETURNING id`)).rows[0]
    ?? (await client.query(`SELECT id FROM organizations WHERE name='Demo organization' LIMIT 1`)).rows[0];

  // fresh demo scan (cascade-deletes old findings)
  await client.query(`DELETE FROM scans WHERE domain=$1`, [DEMO_DOMAIN]);
  const scan = (await client.query(
    `INSERT INTO scans (org_id, domain, status, consent_by, consent_at, ownership_verified, ownership_method,
                        source_status)
     VALUES ($1,$2,'done','PerIPan',now(),true,'owner-allowlist',
             '{"website":{"status":"done"},"server":{"status":"done"},"other":{"status":"done"}}'::jsonb)
     RETURNING id`, [org.id, DEMO_DOMAIN])).rows[0];

  for (const [source, confidence, title, severity, sevPlain, plain, fix, cve, mod] of FINDINGS) {
    const pkg = SERVER_PKG[title];
    await client.query(
      `INSERT INTO findings (scan_id, source, confidence, title, severity, severity_plain,
         plain_explanation, fix_text, cve_id, module, purl, package_name, ecosystem,
         installed_version, fixed_version, enrichment_status, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'done',$16)`,
      [scan.id, source, confidence, title, severity, sevPlain, plain, fix, cve, mod,
       pkg?.[0] ?? null, pkg?.[1] ?? null, pkg?.[2] ?? null, pkg?.[3] ?? null, pkg?.[4] ?? null,
       idem(scan.id, source, title)],
    );
  }
  console.log('Seeded demo scan:', scan.id);
} finally {
  await client.end();
}
