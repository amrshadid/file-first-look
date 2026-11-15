# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Unopened Files** view in the Explorer, listing files created after tracking started that haven't been opened.
- Automatic clearing when a file stays the active editor for `minimumViewTime` in a focused window. Diff views don't count.
- Detection of files written by other programs, such as agent CLIs, through a file watcher plus reconcile scans.
- Persistence across commits, branch work and restarts, and detection of files added while VS Code was closed.
- `.gitignore` support through `git ls-files` / `git check-ignore` (`respectGitIgnore`).
- Configurable exclusions (`exclude`), with defaults for dependencies, build output and caches.
- Commands: Start Tracking, Stop Tracking, Refresh, Mark as Opened, Mark All as Opened.
