# SafetyRoutes

A vulnerability scanning tool for identifying security weaknesses across applications and infrastructure.

> **Status:** early development — project scaffolding in progress.

## Overview

SafetyRoutes aims to help developers and security teams discover, prioritize, and
remediate vulnerabilities. The scope, scanning targets, and tech stack are still being
defined — see the roadmap below.

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
- **Deployment:** runs via Docker and Docker Compose (development mode via
  `./scripts/start --mode=development`).
- **License:** BSD-3-Clause.

> **Note:** Artemis is experimental software under active development — use at your own
> risk, and only against systems you are authorized to scan.

## Planned features

- [ ] Stand up Artemis via Docker Compose as the scanning engine
- [ ] Define scan targets (e.g. dependencies, source code, web endpoints, infrastructure)
- [ ] Automate Artemis scans (orchestration, scheduling, target intake)
- [ ] Custom Artemis modules for SafetyRoutes-specific checks
- [ ] Findings storage and severity prioritization
- [ ] Reporting (CLI + exportable formats)
- [ ] CI/CD integration

## Getting started

_Setup instructions will be added once the stack is chosen._

## Responsible use

SafetyRoutes is intended for **authorized security testing only**. Scan only systems you
own or have explicit written permission to test. Unauthorized scanning may be illegal.

## License

To be determined.
