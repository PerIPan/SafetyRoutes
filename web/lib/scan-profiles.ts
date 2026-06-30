// Single source of truth for the website scan-depth presentation (label / blurb / help copy /
// capability matrix). CLIENT-SAFE — no server imports — so the wizard, the help modal, and the
// server gateway (lib/artemis.ts, which attaches the actual Artemis module sets) all share it
// instead of keeping drifting copies.

export type ScanProfileKey = 'essentials' | 'standard' | 'thorough';

export interface ScanProfileMeta {
  key: ScanProfileKey;
  label: string;
  blurb: string; // short line under the radio in the wizard
  best: string; // "best for" line in the help modal
  speed: string; // relative speed shown in the comparison grid
}

export const SCAN_PROFILE_META: ScanProfileMeta[] = [
  {
    key: 'essentials',
    label: 'Essentials',
    blurb: 'The website vulnerability scan — known issues, the apps you run, exposed files, open ports.',
    best: 'A quick first look, or when you just want the core web scan fast.',
    speed: 'Fastest',
  },
  {
    key: 'standard',
    label: 'Standard',
    blurb: 'Essentials, plus email & DNS hygiene checks.',
    best: 'The right choice for most organizations.',
    speed: 'Medium',
  },
  {
    key: 'thorough',
    label: 'Thorough',
    blurb: 'Standard, plus extra DNS and domain-expiry checks. Most complete.',
    best: 'When you want the most complete picture and don’t mind waiting.',
    speed: 'Slowest',
  },
];

// Plain-language capability matrix for the help modal (which depth checks what).
export const SCAN_PROFILE_CHECKS: { label: string; in: Record<ScanProfileKey, boolean> }[] = [
  {
    label: 'Known vulnerabilities (outdated software)',
    in: { essentials: true, standard: true, thorough: true },
  },
  {
    label: 'Accidentally-exposed files & folders',
    in: { essentials: true, standard: true, thorough: true },
  },
  {
    label: 'Open ports & security headers',
    in: { essentials: true, standard: true, thorough: true },
  },
  {
    label: 'Email impersonation (SPF / DMARC)',
    in: { essentials: false, standard: true, thorough: true },
  },
  { label: 'Domain-expiry warning', in: { essentials: false, standard: true, thorough: true } },
  { label: 'Deeper DNS checks', in: { essentials: false, standard: false, thorough: true } },
];

export const DEFAULT_SCAN_PROFILE: ScanProfileKey = 'standard';

export function isScanProfile(v: unknown): v is ScanProfileKey {
  return v === 'essentials' || v === 'standard' || v === 'thorough';
}

// --- Website-tier wait window -------------------------------------------------
// The vuln scan now runs as a separate `nuclei -as` step (lib/nuclei-scan.ts) with its own budget;
// this only caps how long we wait for Artemis's fast hygiene modules before finalizing.
export const SCAN_PROFILE_WEBSITE_TIMEOUT_MS: Record<ScanProfileKey, number> = {
  essentials: 6 * 60_000,
  standard: 10 * 60_000,
  thorough: 15 * 60_000,
};

export function websiteTimeoutForProfile(profile?: string | null): number {
  return SCAN_PROFILE_WEBSITE_TIMEOUT_MS[profile as ScanProfileKey] ?? SCAN_PROFILE_WEBSITE_TIMEOUT_MS.standard;
}
