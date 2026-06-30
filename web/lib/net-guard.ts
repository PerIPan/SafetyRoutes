// Authorization + SSRF guard for active scanning (security review #1, PLAN §6 items 1-3).
// For the bootcamp posture (own test sites only): a server-side allowlist is the gate, plus a
// DNS-resolve check that refuses private/internal/metadata addresses (and rebinding) at scan time.
import { promises as dns } from 'node:dns';

const ALLOWLIST = (process.env.SCAN_ALLOWLIST ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** Normalize "https://Foo.org/path" → "foo.org". */
export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
}

export function isFqdn(domain: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i.test(domain);
}

/** Allowlisted? (empty allowlist = deny everything — fail closed.) */
export function domainAllowed(domain: string): boolean {
  return ALLOWLIST.includes(normalizeDomain(domain));
}

function ipv4Blocked(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // unparseable → block
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-net, RFC1918, loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function ipv6Blocked(ip: string): boolean {
  const l = ip.toLowerCase();
  return (
    l === '::1' || l.startsWith('fc') || l.startsWith('fd') || // loopback, ULA
    l.startsWith('fe80') || l.startsWith('::ffff:') // link-local, ipv4-mapped
  );
}

export interface GuardResult { ok: boolean; reason?: string }

/** Resolve the domain and refuse if it (now) points at a private/internal address. */
export async function checkScanTarget(domain: string): Promise<GuardResult> {
  const d = normalizeDomain(domain);
  if (!isFqdn(d)) return { ok: false, reason: 'Target must be a domain name (not an IP or bare hostname).' };

  const ips: string[] = [];
  const [v4, v6] = await Promise.allSettled([dns.resolve4(d), dns.resolve6(d)]);
  if (v4.status === 'fulfilled') ips.push(...v4.value);
  if (v6.status === 'fulfilled') ips.push(...v6.value);
  if (!ips.length) return { ok: false, reason: 'Domain did not resolve to a public address.' };

  for (const ip of ips) {
    if (ip.includes(':') ? ipv6Blocked(ip) : ipv4Blocked(ip)) {
      return { ok: false, reason: `Refusing to scan a private/internal address (${ip}).` };
    }
  }
  return { ok: true };
}

/** Combined gate: allowlist + SSRF. Returns ok or a 403-worthy reason. */
export async function authorizeScan(domain: string): Promise<GuardResult> {
  if (!domainAllowed(domain)) {
    return { ok: false, reason: 'This domain is not in the scan allowlist (own-sites-only for now).' };
  }
  return checkScanTarget(domain);
}
