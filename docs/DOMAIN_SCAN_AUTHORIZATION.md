# SafetyRoutes — Permission to Scan Your Website

**A plain-language authorization form**

| | |
|---|---|
| Organization | `[REQUIRED: full legal name]` |
| Website(s) | `[REQUIRED: exact domain names]` |
| SafetyRoutes operator | `[REQUIRED: full legal name]` |
| Proposed scan date | `[REQUIRED: date and time zone]` |
| Document version | `1.0 — [YYYY-MM-DD]` |

> **Please read this document before signing.** It explains what SafetyRoutes will and will not
> do. The more detailed [Technical Schedule](DOMAIN_SCAN_TECHNICAL_SCHEDULE.md) is part of this
> authorization. Ask us about anything that is unclear. Scanning will not begin until the required
> fields are completed and both parties have signed.

## The short version

With your permission, SafetyRoutes will send automated requests to the public website addresses
listed in this form. The purpose is to identify common, externally visible security weaknesses and
give you a private, understandable report.

The scan:

- looks only at the exact public domains you approve;
- does not log in or use passwords;
- does not intentionally exploit vulnerabilities;
- does not change or delete your data;
- does not use denial-of-service, brute force, phishing, or social engineering;
- may create security alerts or appear in your server logs; and
- cannot prove that your organization is secure or find every vulnerability.

You can tell us to stop at any time using the emergency contact below.

## 1. What we will check

Choose one scan level:

| Check | Essentials | Standard | Thorough |
|---|:---:|:---:|:---:|
| Known weaknesses matching the website technology | Yes | Yes | Yes |
| Accidentally exposed files, folders, or source-control data | Yes | Yes | Yes |
| Publicly reachable website services and non-standard ports | Yes | Yes | Yes |
| Publicly exposed administration or login panels | Yes | Yes | Yes |
| `robots.txt` disclosures | Yes | Yes | Yes |
| Email and DNS security configuration | — | Yes | Yes |
| Additional DNS and domain-expiration checks | — | — | Yes |

**Selected level:** `[REQUIRED: Essentials / Standard / Thorough]`

### Vulnerability templates

SafetyRoutes uses Nuclei templates in two limited groups:

1. templates automatically matched to technology visible on the website—for example, templates
   relevant to WordPress, Drupal, Joomla, Apache, or nginx when that technology is detected; and
2. installed templates in `http/exposures/` and `http/exposed-panels/`, which look for exposed
   files, configuration, backups, logs, secrets, dashboards, and management/login panels.

The fixed template group excludes templates tagged `dos`, `fuzz`, `intrusive`, or
`default-login`. Before a production scan, the Operator must also verify or technically enforce
that the automatically selected group cannot run a prohibited template. The Operator records the
Nuclei version, template-library version, effective exclusions, and executed or selected template
IDs in a scan manifest. You may request that manifest.

An exposed login or administration page is reported as something to review; its presence alone is
not described as a vulnerability. The scanner does not submit credentials.

Full template selection, rate, timeout, and manifest rules appear in Sections 4 and 6 of the
[Technical Schedule](DOMAIN_SCAN_TECHNICAL_SCHEDULE.md).

## 2. What we will not do

SafetyRoutes is not authorized to:

- guess passwords, try default credentials, brute-force accounts, or log in;
- exploit a weakness to gain access;
- copy, alter, delete, encrypt, or intentionally download your data;
- install software or malware, run commands, or create persistent access;
- perform denial-of-service, stress, load, or resource-exhaustion testing;
- bypass a firewall, WAF, CAPTCHA, rate limit, or access control;
- use phishing, social engineering, or physical-security testing;
- scan internal/private systems, IP ranges, unlisted subdomains, or unrelated third parties;
- automatically treat a different domain reached through a redirect as approved; or
- publish or share your findings without written permission, unless disclosure is required by law.

Anything not clearly included in Section 1 is excluded unless both parties approve it in writing.

## 3. Exact websites you authorize

List every domain separately. Do not use wildcards such as `*.example.org`.

| Exact domain | Production or test? | Website owner | Hosting/CDN provider |
|---|---|---|---|
| `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` |
|  |  |  |  |
|  |  |  |  |

**Domains, paths, ports, or services that must not be tested:**  
`[REQUIRED: enter exclusions or write “None”]`

**Separately approved redirect destinations:**  
`[REQUIRED: enter exact domains or write “None”]`

By signing, the Organization confirms that it owns or controls these websites, or has written
permission from the owner to authorize this scan. If a hosting provider, cloud provider, CDN, or
other supplier requires permission, the Organization confirms that it has obtained it.

## 4. When and how the scan will run

| Setting | Agreed value |
|---|---|
| Scan window, including time zone | `[REQUIRED]` |
| One-time or recurring | `[REQUIRED]` |
| Number of permitted retests | `[REQUIRED]` |
| Authorization expiry | `[REQUIRED]` |
| Scanner source IP address(es) | `[REQUIRED]` |
| Maximum combined request rate | `[REQUIRED]` |
| Required advance notice | `[REQUIRED]` |
| Scan/template manifest reference | `[REQUIRED]` |

Automated security scans send real network requests. They may appear in access logs, trigger a
WAF, rate limit, monitoring alert, hosting-provider alert, or expose an existing application
defect. SafetyRoutes is designed to reduce these risks, but cannot promise zero disruption.

The Operator will stop starting new requests as soon as reasonably practicable if you request it,
service degradation is suspected, private information is unexpectedly accessed, or the scan moves
outside the agreed scope. Requests already in progress may take a short time to finish.

## 5. Emergency contacts

| Role | Name | Telephone | Email | Available hours |
|---|---|---|---|---|
| Your technical contact | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` |
| Your authorized representative | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` |
| SafetyRoutes scan lead | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` | `[REQUIRED]` |

**To stop a scan:** contact the SafetyRoutes scan lead by telephone and email. The Operator will
confirm receipt and the scan status in writing.

## 6. What information we keep

SafetyRoutes may record:

- your organization, approved contact, domain, authorization, and scan times;
- public IP addresses, ports, URLs, DNS/email configuration, and visible software information;
- scanner activity, findings, vulnerability identifiers, evidence needed to explain a finding,
  and the final report; and
- audit events and retest results.

We do not intentionally look for personal data, credentials, or confidential content. A publicly
exposed system may reveal such information unexpectedly. If that happens, the Operator will stop
the affected activity, restrict access, notify your technical contact, and avoid collecting more
than is necessary to handle the incident.

Complete these arrangements before signing:

| Data arrangement | Agreed value |
|---|---|
| Hosting/storage country or region | `[REQUIRED]` |
| People permitted to access results | `[REQUIRED]` |
| Service providers/subprocessors | `[REQUIRED or “None”]` |
| Secure report-delivery method | `[REQUIRED]` |
| Raw scan-data retention | `[REQUIRED]` |
| Final-report retention | `[REQUIRED]` |
| Backup deletion period | `[REQUIRED]` |

Results are confidential. Target domains, raw responses, personal data, and confidential
information will not be sent to a generative-AI provider unless you approve the provider, purpose,
data, location, and retention terms separately in writing.

> **Deployment requirement:** The current SafetyRoutes application does not automatically enforce
> a deletion schedule. The Operator must implement and verify the retention periods above before
> making them a contractual commitment.

## 7. What the report means

The report is a point-in-time summary of what the selected checks observed. It separates confirmed
scanner findings, items requiring manual verification, incomplete checks, and checks that found no
issue where practicable.

The report is not:

- a guarantee that the website or organization is secure;
- a complete penetration test or internal-network assessment;
- a compliance certificate, legal opinion, or audit;
- proof that no other vulnerability or compromise exists; or
- a substitute for patching, monitoring, backups, incident response, and expert validation.

Automated findings can be wrong or incomplete. Important findings should be independently
validated before major operational, legal, disciplinary, or public decisions are made.

## 8. Legal terms

This form grants limited technical permission only. Fees, warranties, liability, indemnities,
insurance, intellectual property, data-protection roles, and dispute procedures are governed by:

`[REQUIRED: name the signed services/data-processing agreement, or obtain legal review before use]`

| | |
|---|---|
| Governing law | `[REQUIRED]` |
| Court or dispute forum | `[REQUIRED]` |
| Order of precedence between documents | `[REQUIRED]` |

Nothing here authorizes unlawful, negligent, reckless, intentional, or out-of-scope conduct. This
form and the Technical Schedule should be reviewed by qualified counsel for the parties,
jurisdiction, contracts, deployment, and data involved.

## 9. Approval

By signing, both parties confirm that they have read and accept:

1. this plain-language authorization;
2. the [Technical Schedule and Rules of Engagement](DOMAIN_SCAN_TECHNICAL_SCHEDULE.md); and
3. the exact targets, limits, dates, and contacts completed above.

The Organization specifically authorizes the described network requests against the listed
domains during the agreed scan window.

### Organization authorizing the scan

| | |
|---|---|
| Full legal name | `[REQUIRED]` |
| Representative | `[REQUIRED]` |
| Job title and authority | `[REQUIRED]` |
| Signature | `________________________________` |
| Date and time zone | `[REQUIRED]` |

### SafetyRoutes operator

| | |
|---|---|
| Full legal name | `[REQUIRED]` |
| Representative | `[REQUIRED]` |
| Job title | `[REQUIRED]` |
| Signature | `________________________________` |
| Date and time zone | `[REQUIRED]` |

---

**Operator pre-scan gate:** Do not scan unless signatures, ownership/third-party authority,
allowlisting, source IPs, exclusions, emergency contacts, data arrangements, template manifest,
effective prohibited-template exclusions, and stop controls have all been verified.

**Reference guidance:** [NCSC-NL coordinated vulnerability disclosure](https://www.ncsc.nl/en/services/report-a-vulnerability)
and [EU GDPR Article 5](https://eur-lex.europa.eu/eli/reg/2016/679/art_5/oj).
