# Screenshots

Wizard + report screenshots used by the root `README.md` ("The app").
Captured against the live dev server (`cd web && npm run dev`) at 1280-wide, 2× DPI.

| File | What it shows |
|------|---------------|
| `01-what-to-check.png` | Step 1 — pick the three checks + optional "Tailor your report" org context |
| `02-help-modal.png` | A per-step "How this step works" explainer modal |
| `03-website.png` | Step 2 — website target + scan-depth choice |
| `04-scan-depth-help.png` | The Essentials/Standard/Thorough comparison modal |
| `05-other-software.png` | Step 3 — manual product + version entry |
| `06-server-packages.png` | Step 4 — the collector's Trivy report waiting to adopt |
| `07-run.png` | Step 5 — review of everything provided |
| `08-report.png` | The report: Gemini executive summary + source-tagged findings |
| `09-executive-summary.png` | The AI business-impact summary, up close |

Regenerate after UI changes: drive the running app with a headless browser
(Playwright / `chromium-cli`) through the five steps + `/report/<id>` and re-shoot.
Keep the names stable so the README links don't break.
