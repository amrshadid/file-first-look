# Contributing to File First Look

Thanks for helping. This is a small project with a narrow scope, so please read
[docs/design-principles.md](docs/design-principles.md) before proposing a feature. The
first question for any change is: _does it help a developer notice new files they
haven't looked at?_

## Getting started

Requirements: Node.js 22 or 24 (see `.nvmrc`), git, and VS Code.

```sh
npm ci
npm run check   # lint, formatting, type check, unit tests
```

Press **F5** in VS Code to launch an **Extension Development Host**. It runs in a
separate window with a temporary profile (`--profile-temp`) and the test fixture
folder, so your own settings, extensions and other open projects aren't affected.

| Script                     | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `npm run build`            | Bundle to `dist/` with esbuild                     |
| `npm run watch`            | Rebuild on change                                  |
| `npm test`                 | Unit tests (Vitest)                                |
| `npm run test:coverage`    | Unit tests with coverage thresholds                |
| `npm run test:integration` | End-to-end tests in a downloaded, isolated VS Code |
| `npm run lint`             | ESLint (strict, type-aware)                        |
| `npm run format`           | Prettier                                           |
| `npm run package`          | Build a `.vsix`                                    |

## Where code goes

See [docs/architecture.md](docs/architecture.md). In short:

- **Tracking rules** go in `src/core/`. Keep them pure: no `vscode` imports (ESLint enforces this) and full unit tests.
- **VS Code glue** goes in `src/adapters/`. Keep it thin, with no business rules.
- **Wiring and commands** go in `src/extension.ts`.

## Standards

- TypeScript `strict`. No `any`; use `unknown` and narrow it.
- Comments explain _why_. Link to VS Code docs when working around API behaviour.
- New logic ships with tests. A bug fix starts with a failing test.
- No new runtime dependencies without discussion in an issue first.
- No telemetry, network access or files written into the user's repository. These are product promises.

## Commits and pull requests

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(view): show folder path as row description

Long paths were hard to scan in narrow sidebars.
```

- Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.
- Scopes: `core`, `watcher`, `editor`, `storage`, `view`, `config`, `git`, `ci`, `docs`, `deps`.
- Keep the subject imperative and under 72 characters. Use the body to explain _why_.
- One logical change per commit. Pull requests are squash-merged, so the PR title must also follow the convention.

Before opening a PR, make sure `npm run check` and `npm run test:integration` pass, and
fill in the PR template.

## Reporting bugs

Open an issue using the bug template. The **File First Look** output channel
(_View → Output_) logs scans and errors, and including it helps a lot.

For security issues, see [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
