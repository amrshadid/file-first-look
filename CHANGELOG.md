# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-15

First pilot pre-release.

### Added

- **Unopened Files** view in the Explorer, listing files created after tracking started that haven't been opened.
- Automatic clearing when a file stays the active editor for `minimumViewTime` in a focused window. Diff views don't count.
- Detection of files written by other programs, such as agent CLIs, through a file watcher plus reconcile scans.
- Persistence across commits, branch work and restarts, and detection of files added while VS Code was closed.
- `.gitignore` support through `git ls-files` / `git check-ignore` (`respectGitIgnore`).
- Configurable exclusions (`exclude`), with defaults for dependencies, build output and caches.
- Commands: Start Tracking, Stop Tracking, Refresh, Mark as Opened, Mark All as Opened.
- Files you've already seen never come back as new after a branch switch, `git stash` or a rebuild.
- Scope changes (exclusions, `.gitignore` edits, workspace trust) never mark existing files as new, even when they happen while VS Code is closed.
- Version-control folders (`.git`, `.hg`, `.svn`) are always excluded.

### Security

- git is not run in untrusted workspaces, runs with `core.fsmonitor` disabled, and is launched by absolute path on Windows.

### Performance

- Deletes are batched and never touch the baseline, so large delete bursts stay fast in big repositories.
- State is saved to crash-safe files, and the baseline is written only when it changes.

[Unreleased]: https://github.com/amrshadid/file-first-look/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/amrshadid/file-first-look/releases/tag/v0.1.0
