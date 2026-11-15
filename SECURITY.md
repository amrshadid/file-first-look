# Security policy

File First Look runs locally. It makes no network requests, collects no telemetry and
writes nothing into your repository. It stores file paths in VS Code's workspace
storage, and it runs `git` (read-only commands: `rev-parse`, `ls-files`, `check-ignore`)
inside your workspace folder.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository instead (**Security → Report a vulnerability**).

We aim to acknowledge reports within 7 days. Only the latest release is supported with fixes.
