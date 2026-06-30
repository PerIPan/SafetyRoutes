# SafetyRoutes — README screenshots

Captured at 1440×900 (desktop) against the live local app. Drop-in ready for the README — copy the
embed blocks below. Files live in `docs/screenshots/`.

| # | File | Shows | Suggested README use |
|---|------|-------|----------------------|
| 01 | `01-landing.png` | Landing hero + three-tier explainer (Website / Server packages / Other software) | Top of README, "What it is" |
| 02 | `02-wizard-step1.png` | Wizard Step 1 — permission, site, and the website-depth picker | "How it works" → step 1 |
| 03 | `03-depth-help.png` | "How deep should we check?" comparison modal (Essentials / Standard / Thorough) | Explaining scan depth |
| 04 | `04-autocomplete.png` | Step 3 live MITRE Explorer autocomplete (Microsoft Office · per-version CVE counts) | "Other software" / MITRE integration |
| 05 | `05-step4-summary.png` | Step 4 — plain-language run summary before launch | "How it works" → review & run |
| 06 | `06-report-full.png` | Full report, all findings, grouped into Fix now / Plan / Check / Clear (full-page) | Hero report image |
| 07 | `07-report-hero.png` | Report header — per-tier status + Confirmed / Needs-a-check / Looking-good counts | "The report" section |
| 08 | `08-finding-detail.png` | Expanded finding — CVE summary, EPSS likelihood, package URL, MITRE Explorer link | Showing finding depth |
| 09 | `09-report-scanning.png` | Live "scanning…" report state (auto-refreshes; no dead-end links) | "Live results" |
| 10 | `10-report-real.png` | _Pending_ — real nuclei templates from a live scan | "Real scan output" |

## Alt text (accessibility / GitHub)

- 01 — "SafetyRoutes landing page: 'A friendly health check-up for your organization' with Website, Server packages, and Other software cards."
- 02 — "Step 1 of the guided check: enter your website, confirm authorization, and choose a scan depth."
- 03 — "Scan-depth comparison: Essentials, Standard, and Thorough across what each checks and how long it takes."
- 04 — "Step 3 software entry with live autocomplete showing Microsoft Office versions and their known-CVE counts from MITRE Explorer."
- 05 — "Step 4 summary listing the website, chosen depth, and any software to check before running."
- 06 — "Full plain-language report grouping findings into Fix now, Plan to fix, Needs a quick check, and All clear."
- 07 — "Report header showing each scan tier as done and counts of confirmed issues, quick checks, and clear items."
- 08 — "An expanded finding showing the CVE summary, exploitation likelihood, affected package, and a link to MITRE Explorer."
- 09 — "A report mid-scan, showing the website check running and refreshing automatically."

## Embed block (paste into README.md)

```md
![SafetyRoutes landing](docs/screenshots/01-landing.png)

### How it works
![Step 1 — permission & site](docs/screenshots/02-wizard-step1.png)
![Choosing scan depth](docs/screenshots/03-depth-help.png)
![Step 3 — software autocomplete (MITRE Explorer)](docs/screenshots/04-autocomplete.png)
![Step 4 — review & run](docs/screenshots/05-step4-summary.png)

### The report
![Full report](docs/screenshots/06-report-full.png)
![A finding in detail](docs/screenshots/08-finding-detail.png)
```

## Notes

- Shots 06–08 use the bundled sample report (`/demo`, "harbourtrust.org") so they're deterministic
  and safe to publish — no real org data.
- Older `sr-1`…`sr-6` PNGs in this folder are from an earlier UI (pre-column-reorder, no depth
  picker, 1280px) — superseded by 01–09; safe to delete.
