# SafetyRoutes Domain Security Scan — Technical Schedule and Rules of Engagement

**Document status:** Draft for legal and operational review  
**Version:** 0.1  
**Effective date:** `[YYYY-MM-DD]`

> **Important:** This template records permission and the technical rules for a SafetyRoutes
> domain scan. It is not legal advice and is not a substitute for a services agreement, data
> processing agreement, privacy notice, or review by qualified counsel in the applicable
> jurisdiction. Complete every field marked `[REQUIRED]` before signature. Do not begin a scan
> while any required field is blank.

## 1. Parties and purpose

This Domain Security Scan Authorization and Rules of Engagement (the **Authorization**) is
between:

- **Organization authorizing the scan (Organization):** `[REQUIRED: full legal name]`
- **Registered address:** `[REQUIRED]`
- **Company/registration number, if applicable:** `[REQUIRED or N/A]`
- **SafetyRoutes operator (Operator):** `[REQUIRED: full legal name]`
- **Operator address:** `[REQUIRED]`

The Organization authorizes the Operator to perform the limited external security assessment
described below solely to identify potential security weaknesses, explain the observed exposure,
and recommend remediation. This is a point-in-time, best-effort assessment of the expressly
authorized targets. It is not a penetration test, compliance certification, guarantee of
security, or assurance that all vulnerabilities will be detected.

## 2. Authority of the Organization

The Organization represents that:

1. it owns or controls every target listed in Appendix A, or has obtained written authority from
   each relevant owner to authorize the activities in this document;
2. the signatory has authority to bind the Organization and grant this permission;
3. it has identified any hosting provider, cloud provider, content-delivery network, managed
   service provider, or other third party whose systems may receive scan traffic, and has obtained
   any permission required by contract or law;
4. the targets and contact details supplied to the Operator are accurate; and
5. it will notify the Operator promptly if its authority or the target infrastructure changes.

Authorization of a domain name alone may not be sufficient where the underlying infrastructure
belongs to a third party. The Organization remains responsible for confirming any required
third-party permission.

## 3. Authorized targets

Only the exact fully qualified domain names (**FQDNs**) listed in Appendix A are authorized.
Authorization does not automatically extend to:

- parent domains, sibling domains, subdomains, or wildcard domains;
- IP addresses or services discovered during a scan;
- a different hostname reached through an HTTP redirect;
- internal/private systems;
- third-party services embedded in or linked from the authorized website; or
- any production, staging, test, or development environment not listed separately.

SafetyRoutes accepts public FQDNs, checks them against a server-side allowlist, resolves them at
scan time, and refuses targets resolving to private, loopback, link-local, carrier-grade NAT, or
other blocked internal address ranges. SafetyRoutes does not add a redirect destination as a new
scan target. Individual scanner or HTTP-client behavior must nevertheless be configured and
verified before production use to prevent requests from following a cross-host redirect to an
unauthorized hostname. Any redirect destination intended to receive scan traffic must be listed
and allowlisted separately.

## 4. Included activities

Subject to the scan profile selected in Appendix A, the Operator may perform the following
unauthenticated checks from the public internet.

### 4.1 Essentials profile

- Resolve public DNS records needed to reach the authorized FQDN.
- Connect to the authorized website using HTTP and HTTPS.
- Identify externally reachable ports and services. Normal web ports 80 and 443 are not reported
  as vulnerabilities merely because they are open.
- Fingerprint publicly observable web technologies.
- Check for publicly exposed source-control data, including exposed `.git` content.
- Check for publicly exposed directory listings.
- Inspect `robots.txt` for potentially sensitive disclosures.
- Run the Nuclei template groups and selection process described in Section 4.1.1.

### 4.1.1 Nuclei templates and selection

SafetyRoutes does **not** run every template in the installed Nuclei template library. It starts
two Nuclei processes in parallel against the single authorized URL:

1. **Technology-matched automatic scan.** Nuclei's `-as` mode fingerprints publicly observable
   technologies using Wappalyzer information and selects templates whose technology tags match
   the detected stack. For example, a WordPress, Apache, nginx, Drupal, Joomla, or other detected
   technology may cause the corresponding tagged vulnerability templates to run. The exact
   template IDs are determined at scan time from:
   - the technologies Nuclei detects;
   - the Nuclei binary version;
   - the locally installed `nuclei-templates` version and contents; and
   - Nuclei's automatic-scan selection logic.

   This is therefore a bounded **selection rule**, not a permanent list of template IDs.

2. **Fixed exposure and panel overlay.** SafetyRoutes explicitly selects all installed templates
   under these two Nuclei template directories:
   - `http/exposures/` — checks for publicly exposed files, configuration, backups, logs,
     credentials/secrets, source artifacts, dashboards, and other information exposures represented
     by the templates installed in that directory; and
   - `http/exposed-panels/` — discovery checks for publicly reachable administrative, management,
     login, monitoring, database, infrastructure, and product panels represented by the templates
     installed in that directory.

   The overlay is restricted to templates with Nuclei severity `low`, `medium`, `high`, or
   `critical`. Templates tagged `dos`, `fuzz`, `intrusive`, or `default-login` are explicitly
   excluded from this overlay. An exposed-panel match is reported as an advisory requiring review,
   not by itself as proof of a vulnerability. SafetyRoutes does not supply credentials to the
   overlay.

Both processes use Nuclei's JSON output mode, disable template-update checks during the scan, and
use a 10-second Nuclei request timeout. The automatic process is configured at 120 requests per
second and the overlay at 60 requests per second. Because they run concurrently, their configured
combined ceiling is 180 requests per second before target latency and other Nuclei controls. The
lower aggregate limit entered in Appendix A governs if it is below that ceiling and must be
technically enforced before scanning.

SafetyRoutes suppresses technology-only/noise matches from the final report when their template ID
matches detector patterns such as `tech-detect`, `wappalyzer`, `waf-detect`, `favicon`,
`screenshot`, or `fingerprinthub`. Suppression affects reporting only; it does not prove that a
template was not executed.

#### Required template manifest

Because the installed template library can change, the Operator must create and retain a manifest
for each scan or approved scan campaign containing:

- Nuclei binary version;
- `nuclei-templates` release/version or source commit;
- template update date;
- the exact automatic-scan command options;
- the exact overlay directories, severity filter, and excluded tags;
- the template IDs Nuclei selected or executed, where Nuclei exposes that information;
- the template IDs that produced matches; and
- a cryptographic hash of any locally modified template.

The manifest reference must be entered in Appendix A and supplied to the Organization on request.
Adding a custom template, another template directory, or materially changing the selection or
exclusions requires written scope approval.

> **Current implementation control gap:** The fixed overlay presently passes
> `-exclude-tags dos,fuzz,intrusive,default-login`, but the technology-matched `-as` invocation does
> not pass the same exclusion option. The Operator must not rely on this Authorization for a
> production scan until the effective templates selected by `-as` have been reviewed and recorded,
> or the automatic invocation has been changed and tested to enforce the approved exclusions.
> This warning must not be removed merely by completing the form.

### 4.2 Standard profile

Everything in Essentials, plus checks of publicly available email and DNS security configuration.

### 4.3 Thorough profile

Everything in Standard, plus additional public DNS and domain-expiration checks.

### 4.4 Analysis and reporting

The Operator may:

- compare observed software and vulnerability identifiers with public vulnerability information;
- classify findings by source, confidence, severity, CISA Known Exploited Vulnerability status,
  EPSS, and CVSS where available;
- create a plain-language report containing observations, possible business impact, and suggested
  remediation; and
- perform the retests expressly authorized in Appendix A to determine whether reported findings
  remain observable.

The Organization acknowledges that vulnerability checks can produce false positives and false
negatives. Findings should be validated before material operational, legal, disciplinary, or
public-disclosure decisions are made.

## 5. Expressly excluded and prohibited activities

Unless added through a separately signed amendment, the following are outside scope and must not
be performed:

- exploiting a vulnerability beyond the minimum non-destructive request needed by an approved
  scanner check to identify it;
- obtaining or attempting to obtain unauthorized access to an account or restricted area;
- authenticated testing or use of credentials, session tokens, API keys, or customer accounts;
- password guessing, credential stuffing, brute-force attacks, or password spraying;
- denial-of-service, distributed denial-of-service, stress, load, capacity, or resource-exhaustion
  testing;
- malware delivery, persistence, command execution, web shells, ransomware simulation, or lateral
  movement;
- modifying, creating, deleting, encrypting, downloading, or intentionally exfiltrating
  Organization or user data;
- phishing, pretexting, social engineering, physical-security testing, or contacting personnel
  other than the designated contacts;
- wireless, endpoint, mobile application, source-code, cloud-control-plane, internal-network, or
  firewall-rule testing;
- scanning unlisted subdomains, redirect destinations, IP ranges, APIs, mail servers, name
  servers, or third-party infrastructure as independent targets;
- bypassing a WAF, CAPTCHA, access-control mechanism, rate limit, or monitoring control;
- publishing or sharing vulnerability details with anyone other than the authorized recipients;
  or
- any activity prohibited by law, third-party terms, or this Authorization.

SafetyRoutes is designed as a low-impact vulnerability scanner, but “low impact” does not mean
“no risk.” Active scanning sends real requests to production systems and can trigger logs,
monitoring alerts, rate limits, security controls, application defects, or unanticipated service
behavior.

## 6. Timing, traffic, and operational controls

- **Authorized scan window:** `[REQUIRED: date, start/end time, and time zone]`
- **Permitted frequency:** `[REQUIRED: one-time / recurring schedule]`
- **Operator source IP address(es):** `[REQUIRED]`
- **Selected profile:** `[REQUIRED: Essentials / Standard / Thorough]`
- **Maximum Operator-imposed aggregate request rate:** `[REQUIRED; must not exceed the configured
  scanner limit]`
- **Excluded paths or services:** `[REQUIRED or None]`
- **Known fragile systems or constraints:** `[REQUIRED or None]`

The current SafetyRoutes application stops waiting for Artemis results after approximately 6
minutes for Essentials, 10 minutes for Standard, and 15 minutes for Thorough. The separate Nuclei
processes currently have an approximately 200-second process timeout. Scanner processes
and target-side logging may not end at exactly the same moment. These values are operational
timeouts, not promised completion times or maximum traffic durations.

The Operator will use the least intrusive profile reasonably suited to the stated purpose and
will keep intrusive and brute-force Artemis modules disabled. The Operator will not change the
scope, rate, profile, or schedule without written approval from an authorized Organization
contact.

## 7. Stop conditions and emergency procedure

The Operator must stop initiating new scan activity as soon as reasonably practicable if:

- the Organization requests a stop through an emergency contact;
- the Operator observes or reasonably suspects service degradation, data modification, access to
  non-public data, an uncontrolled redirect, or activity outside scope;
- a target resolves to a blocked or unauthorized address;
- the Operator cannot confirm the approved scanner module set; or
- continued testing may cause harm or violate law, contract, or this Authorization.

Stopping is best-effort: requests already in transit and independently queued scanner tasks may
take a short time to terminate.

### Emergency contacts

| Role | Name | Telephone | Email | Available hours |
|---|---|---|---|---|
| Organization technical contact | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` |
| Organization authority/contact | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` |
| Operator scan lead | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` |

The Organization may revoke authorization by contacting the Operator scan lead. Revocation applies
prospectively and does not undo completed processing or recordkeeping that must lawfully be
retained. The Operator will confirm receipt and the scan status in writing.

## 8. Data handling and confidentiality

### 8.1 Data that may be processed

Depending on selected features and observed responses, SafetyRoutes may process:

- Organization name, authorized contact name, domain, consent time and method, and ownership
  verification details;
- scan identifiers, profile, timestamps, audit events, public IP addresses, ports, URLs, software
  and version indicators, DNS/email configuration, response metadata, vulnerability identifiers,
  and scanner findings;
- limited response content or excerpts returned by a scanner where necessary to evidence a
  finding; and
- reports, severity information, remediation text, and retest results.

No personal data or confidential content is intentionally sought. Public responses can
nevertheless expose personal data, credentials, secrets, or confidential information
unexpectedly. If this occurs, the Operator will stop the affected activity, restrict access,
notify the designated Organization contact, and avoid further access except as necessary to
securely preserve minimal evidence or comply with law.

### 8.2 Storage and recipients

- **Hosting and storage location(s):** `[REQUIRED]`
- **Authorized Operator personnel/roles:** `[REQUIRED]`
- **Technical service providers/subprocessors:** `[REQUIRED or None]`
- **Encryption and access controls:** `[REQUIRED]`
- **Report delivery method:** `[REQUIRED: secure portal/encrypted transfer/etc.]`

Artemis and Nuclei are intended to run in Operator-controlled infrastructure. Vulnerability
enrichment may send vulnerability, product, package, and version identifiers to the configured
MITRE Explorer service. The Operator must document the actual deployment and recipients above
before signature. Target domains, raw responses, personal data, or confidential information must
not be submitted to a generative-AI service unless the Organization separately approves that
provider, purpose, data set, location, and retention arrangement in writing.

### 8.3 Retention and deletion

- **Raw scanner results retention:** `[REQUIRED: period]`
- **SafetyRoutes database and audit retention:** `[REQUIRED: period]`
- **Final report retention:** `[REQUIRED: period]`
- **Backup deletion period:** `[REQUIRED: period]`
- **Deletion or return procedure:** `[REQUIRED]`

The present SafetyRoutes code stores scan and audit records but does not itself enforce an
automatic retention/deletion schedule. The Operator must implement and verify the periods entered
above before using this document as a production commitment. Data must be limited to what is
needed for the stated purpose and retained no longer than the approved purpose and applicable law
require.

### 8.4 Confidentiality and disclosure

The Operator will treat non-public scan information and findings as confidential, disclose them
only to the authorized recipients in Appendix A, and use them only for the stated purpose. No
public disclosure or third-party vulnerability notification may occur without the Organization's
written approval, except where disclosure is required by law. If a potentially serious
third-party or systemic vulnerability is discovered, the parties will agree on a coordinated
vulnerability disclosure process before contacting others, unless urgent legal obligations apply.

## 9. Organization responsibilities

The Organization will:

- maintain current backups and appropriate monitoring;
- notify relevant operational, hosting, SOC, and incident-response teams before the scan;
- provide exclusions and identify fragile or safety-critical systems;
- ensure emergency contacts can order a stop during the scan window;
- investigate findings and decide whether and how to remediate them;
- independently validate high-impact findings before acting on them; and
- promptly report suspected adverse effects to the Operator.

## 10. Deliverables and limitations

The deliverable is a confidential, point-in-time report of checks completed and observations made.
The report will distinguish confirmed scanner findings, advisory items requiring verification,
checks returning no issue, incomplete checks, and unavailable data where practicable.

The assessment does not:

- cover assets or techniques outside Sections 3–5;
- establish the Organization's overall security posture;
- prove the absence of vulnerabilities, compromise, malware, or regulatory non-compliance;
- replace continuous monitoring, patch management, penetration testing, code review, risk
  assessment, legal advice, or compliance audit; or
- warrant that suggested remediation is appropriate for the Organization's environment.

## 11. Incidents and unintended access

The Operator will notify the Organization's technical contact without undue delay after becoming
aware of a material unintended impact or unintended access to non-public data arising from the
scan. The notice will contain known facts, affected targets, timing, immediate containment taken,
and proposed next steps. The parties will preserve relevant evidence and coordinate investigation,
communications, regulatory assessment, and remediation. This section does not determine which
party is a controller, processor, responsible party, or legally required notifier; those matters
must be addressed in the applicable services and data-processing agreements and by counsel.

## 12. Commercial terms, liability, and governing law

This Authorization defines technical permission and boundaries only. Fees, warranties,
indemnities, limitations of liability, insurance, intellectual-property rights, data-protection
roles, dispute resolution, and other commercial or legal terms are governed by:

`[REQUIRED: identify the signed master/services/data-processing agreement, or state that counsel
must add the applicable terms here before signature]`.

- **Governing law:** `[REQUIRED]`
- **Competent court/dispute forum:** `[REQUIRED]`

Nothing in this template waives rights, creates a blanket release from liability, or authorizes
negligent, reckless, intentional, unlawful, or out-of-scope conduct. Counsel should confirm that
the authorization language and signatures are sufficient under the governing law and the
Organization's contracts.

## 13. Term, changes, and complete authorization

This Authorization begins on the effective date and expires on `[REQUIRED: date/time/time zone]`,
unless revoked earlier. Retesting after expiry requires renewed written authorization. Any change
to targets, methods, profile, rate, scan window, or excluded activities must be documented in a
written amendment approved by authorized representatives of both parties. Email approval is valid
only if the governing agreement permits it and the approving individuals are listed in Appendix A.

If this Authorization conflicts with a signed services agreement, data processing agreement, or
specific written amendment, the order of precedence is: `[REQUIRED]`.

## 14. Signatures

By signing, each party confirms that it has read and accepts this Authorization. The Organization
specifically authorizes the in-scope network requests described in Section 4 against the exact
targets and during the windows listed in Appendix A.

### For the Organization

- Legal name: `[REQUIRED]`
- Authorized representative: `[REQUIRED]`
- Title/role: `[REQUIRED]`
- Signature: `________________________________`
- Date and time zone: `[REQUIRED]`

### For the Operator

- Legal name: `[REQUIRED]`
- Authorized representative: `[REQUIRED]`
- Title/role: `[REQUIRED]`
- Signature: `________________________________`
- Date and time zone: `[REQUIRED]`

---

# Appendix A — Scan Order and Approval

## A.1 Exact authorized targets

Do not use wildcards. Enter each FQDN and environment separately.

| # | Exact FQDN | Environment | Owner/legal controller | Hosting/CDN provider | Profile | Authorized? |
|---|---|---|---|---|---|---|
| 1 | `[REQUIRED]` | `[Production/Test]` | `[REQUIRED]` | `[REQUIRED]` | `[E/S/T]` | `[Yes]` |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

**Explicitly excluded domains, hosts, paths, ports, and services:**  
`[REQUIRED or None]`

**Redirect destinations separately authorized, if any:**  
`[REQUIRED or None]`

## A.2 Timing and retesting

- Scan window(s), including time zone: `[REQUIRED]`
- Frequency/maximum number of scans: `[REQUIRED]`
- Retests permitted: `[REQUIRED: No / Yes, number and expiry]`
- Maintenance/change freezes to avoid: `[REQUIRED or None]`
- Required advance notice: `[REQUIRED]`

## A.3 Technical controls

- Operator source IP address(es): `[REQUIRED]`
- Aggregate request-rate limit: `[REQUIRED]`
- User-Agent or scanner identifier, if configured: `[REQUIRED or None]`
- Nuclei binary version: `[REQUIRED]`
- `nuclei-templates` version/commit and update date: `[REQUIRED]`
- Nuclei template manifest reference/hash: `[REQUIRED]`
- Automatic-scan effective exclusions verified: `[REQUIRED: Yes, evidence reference]`
- Organization allowlisting/ticket reference: `[REQUIRED or None]`
- Monitoring/SOC notified: `[REQUIRED: name and date]`
- Backup status confirmed: `[REQUIRED: name and date]`

## A.4 Authorized recipients

| Name | Role | Organization | Email | May receive technical details? |
|---|---|---|---|---|
| `[REQUIRED]` |  |  |  | `[Yes/No]` |

## A.5 Organization-specific restrictions

`[REQUIRED or None]`

---

# Appendix B — Pre-scan Operator Checklist

The Operator must complete this checklist and retain it with the authorization record.

- [ ] Both parties have signed; the Authorization has not expired.
- [ ] Every required field and Appendix A entry is complete.
- [ ] Signatory authority and target ownership/control have been verified.
- [ ] Required hosting, CDN, cloud, or other third-party permissions are recorded.
- [ ] Exact FQDNs are on the server-side SafetyRoutes allowlist.
- [ ] `SCAN_ALLOW_ANY` is disabled in the deployed environment.
- [ ] DNS resolution was checked and no target resolves to a blocked/private address.
- [ ] The selected Artemis module set was retrieved and confirmed.
- [ ] Intrusive and brute-force modules are disabled.
- [ ] Nuclei binary and template-library versions are pinned and recorded.
- [ ] The Nuclei template manifest has been generated and attached to the scan record.
- [ ] The automatic `-as` selection was reviewed or technically restricted so no prohibited
      `dos`, `fuzz`, `intrusive`, or `default-login` template can execute.
- [ ] Source IP, schedule, rate, exclusions, and emergency contacts are confirmed.
- [ ] Organization operations/SOC and relevant providers have been notified.
- [ ] Data locations, recipients, security measures, and retention/deletion periods are complete.
- [ ] Report delivery method has been tested.
- [ ] A stop procedure has been tested and the scan lead can terminate scanner activity.
- [ ] Audit record/ticket number: `[REQUIRED]`

# Appendix C — Reference principles

This template's prohibited-activity and disclosure provisions are informed by the Netherlands
National Cyber Security Centre's coordinated vulnerability disclosure guidance, including avoiding
malware, data copying/modification/deletion, brute force, denial of service, and social
engineering. If personal data may be processed, the deployment should also be reviewed against
applicable data-protection principles, including purpose limitation, data minimization, accuracy,
storage limitation, integrity, confidentiality, and accountability. Applicable requirements
depend on the parties, deployment, data, and jurisdiction and require case-specific legal review.

- [NCSC-NL — Report a vulnerability: guideline](https://www.ncsc.nl/en/services/report-a-vulnerability)
- [NCSC-NL — Coordinated Vulnerability Disclosure policy](https://www.ncsc.nl/cvd-beleid)
- [EU General Data Protection Regulation — Article 5](https://eur-lex.europa.eu/eli/reg/2016/679/art_5/oj)
