# Security policy

## Reporting a vulnerability

Use this repository's [private vulnerability reporting form](https://github.com/akhan157/astraea/security/advisories/new)
**if it is available to you**. Do not post a vulnerability or exploit in a
public issue or pull request.

If GitHub does not offer the form for this repository, ask a maintainer to
arrange a private reporting channel **without including vulnerability details**.
No separate security email address is currently documented.

Once a private channel is agreed, include reproduction steps, affected
version/commit and impact. Please allow time to investigate before disclosure;
no response-time guarantee is offered.

## Scope

Examples of what we want to hear about:

- anything that lets a crafted project, motor or flight-log file run code or
  read files it should not;
- weaknesses in the desktop app's update signing or download handling;
- gaps in the website's or desktop app's content security policy.

Astraea is not certified flight-readiness software. Disagreement between a
simulation and a real flight is a modeling issue, not a security vulnerability;
please open a normal issue for those.

## Supported versions

The 0.10 beta is not yet published. Fixes land on `main`. No published security
update or public auto-update feed is claimed. The locally built Windows installer
is unsigned and its updater signatures use a fixture key; it is not a release.
