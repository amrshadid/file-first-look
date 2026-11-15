# Architecture

File First Look uses a **functional core with an imperative shell**. The rules that
decide which files are "new and unopened" are pure TypeScript with no VS Code
dependency. A thin layer of adapters connects them to the editor.

```
src/
├── core/                    Pure logic, no `vscode` import (enforced by ESLint)
│   ├── paths.ts             Workspace-relative POSIX paths and descendant checks
│   ├── pathFilter.ts        Exclusion globs (picomatch)
│   ├── state.ts             State model and reducer
│   ├── serialization.ts     Versioned persistence format, safe restore
│   └── tracker.ts           Serial event queue around the reducer
├── adapters/                VS Code glue, no business rules
│   ├── configuration.ts     Typed settings
│   ├── gitIgnore.ts         git ls-files / check-ignore
│   ├── workspaceScanner.ts  Full scans (git or findFiles)
│   ├── fileWatcher.ts       Create/delete events → core events
│   ├── visitTracker.ts      Active tab + focus + dwell time → "visited"
│   ├── stateStore.ts        Crash-safe JSON files in VS Code's private storage
│   ├── unopenedFilesView.ts Tree view, badge, description
│   └── uris.ts              URI → workspace-relative path
└── extension.ts             Composition root: wiring and commands
```

Dependencies point inward: `extension.ts → adapters → core`.

## State

The state holds three disjoint sets of workspace-relative paths:

| Set        | Meaning                                                                              |
| ---------- | ------------------------------------------------------------------------------------ |
| `baseline` | Existed when tracking started, or came into scope when the scope changed.            |
| `pending`  | Appeared after tracking started and hasn't been opened. This is what the view shows. |
| `opened`   | Appeared after tracking started and has been opened.                                 |

`baseline` and `opened` are the paths you already know. They are remembered for the
whole tracking session, even after a file is deleted. A branch switch, `git stash` or a
regenerate-on-build tool removes files and later restores them, and a path you have
already seen must never come back as "new".

All changes go through one pure function, `reduce(state, event)`. It is idempotent, and
it returns the same object when nothing changed, so callers can skip saving and
re-rendering.

| Event          | Effect                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `started`      | All present files become the baseline.                                                          |
| `created`      | An unknown path becomes pending.                                                                |
| `visited`      | Pending → opened. An unknown path goes straight to opened, so a late watcher event is harmless. |
| `deleted`      | Batched. Drops pending rows at or under the paths (folder deletes can arrive as one event).     |
| `renamed`      | Moves membership to the new path, including descendants.                                        |
| `reconciled`   | Rescan: unknown present files become pending; pending rows for missing files are dropped.       |
| `scopeChanged` | Rescan after a scope change: newly in-scope files join the baseline, not the list.              |
| `markedOpened` | Manual pending → opened.                                                                        |

## Event flow

```
 file system ──► FileWatcher ──┐
 (any tool)      (batch, git    │
                  ignore check) │
                                ├──► Tracker (serial queue) ──► reduce ──► state
 editor tabs ──► VisitTracker ──┘          │                               │
                 (focus + dwell)           │                               ├──► StateStore (debounced)
                                           │                               └──► UnopenedFilesView
 commands/settings ──► start / reconcile / rescope (scan, then reduce)
```

The tracker runs every operation through a single promise queue. While a scan is in
flight, live events wait behind it, so files created during the baseline scan are
applied after the baseline and are never lost or double-counted.

## Why these choices

- **A file watcher plus scans, not `onDidCreateFiles`.** VS Code's
  `workspace.onDidCreateFiles` doesn't fire for files written by other programs, which
  is exactly how agent CLIs write. Watcher events can be folded during bulk operations,
  so a rescan (on startup and on Refresh) is the safety net.
- **The tab API, not `activeTextEditor`.** In a diff editor the modified side is a real
  file document, so `activeTextEditor` would count diffs as opens. The active tab's
  input type tells them apart, and it also covers images and notebooks.
- **Scope changes never flood the list.** The exclusions, the git-ignore setting and
  workspace trust define the scope. The scope is stored with the state, and `.gitignore`
  files are watched. Whenever the scope changes, even while VS Code was closed, the
  rescan adds newly visible files to the baseline instead of the list.
- **Files, not `workspaceState`, for persistence.** VS Code flushes `workspaceState` to
  disk only periodically or on a clean shutdown, so a crash could lose recent changes.
  State lives in JSON files in VS Code's private per-workspace storage folder. Each write
  goes to a temp file first and is then renamed.
- **git for ignore rules.** `.gitignore` semantics (nesting, negation, global excludes)
  are easy to get wrong. `git ls-files` and `git check-ignore` are authoritative, and
  they're faster on large repositories. git never runs in an untrusted workspace, always
  runs with `core.fsmonitor` disabled, and on Windows is launched by absolute path.

## Performance

- The reducer copies a set only when it changes. Events that don't touch the
  potentially huge baseline cost O(1) for it (covered by a regression test).
- The baseline is persisted in its own file and rewritten only when it changes. The
  small pending/opened record is written once per burst (250 ms debounce).
- Deletes are batched (300 ms) into one event. They only touch the small pending set,
  so `rm -rf dist` with 10k files against a 100k-file baseline takes milliseconds
  (covered by a regression test). Deletes of excluded paths are dropped immediately.
- The watcher exists only while tracking and ignores content changes.
- Watcher creates are batched (100 ms) into one `git check-ignore` call.

## Testing

| Layer    | Tool                               | Scope                                                                             |
| -------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Core     | Vitest                             | Every event, race orderings, persistence, performance invariants. Coverage ≥ 90%. |
| Adapters | `@vscode/test-cli` in real VS Code | End-to-end acceptance checks in `test/fixtures/workspace`.                        |

Integration tests write files with Node's `fs`, like an external agent would, rather
than through the VS Code API.
