# Security policy

File First Look runs locally. It makes no network requests, collects no telemetry and
writes nothing into your repository. It stores file paths in VS Code's private
per-workspace storage folder.

It runs `git` with read-only commands (`rev-parse`, `ls-files`, `check-ignore`) inside
your workspace folder, with these safeguards:

- git is **never run in an untrusted workspace** (Restricted Mode). In that mode,
  workspace values for the exclusion settings are also ignored.
- Every call disables `core.fsmonitor`, so a repository's config can't make git launch
  another program.
- On Windows, git is launched by its absolute path from `PATH`, never from the workspace folder.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository instead (**Security → Report a vulnerability**).

We aim to acknowledge reports within 7 days. Only the latest release is supported with fixes.
