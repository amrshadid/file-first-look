<p align="center"><img src="media/icon.png" width="128" alt="File First Look icon"></p>

# File First Look

**Every new file deserves a first look.**

File First Look is a VS Code extension that shows the new files in your project that
you haven't opened yet. It's built for working with coding agents: when they add
dozens of files in minutes, you still know which ones no human has looked at.

> Agents create 40 files. You open 12. File First Look shows you the other 28.

## Why

Coding agents write files faster than people read them. One prompt to a few parallel
agents (Claude Code, Codex, Aider, Gemini CLI, or a script) can add a whole folder of
code. You review the parts you asked about, the tests pass, and the rest quietly
becomes code nobody has seen.

The risk isn't only bad code. It's **unseen** code: a file you never opened is a file
you can't question, understand or own. Researchers call the gap between generated code
and human understanding _comprehension debt_ ([evidence and sources](docs/why.md)).

Most tools answer _"what changed, accept or reject?"_. File First Look answers an
earlier, simpler question:

> **Which of the new files have I not even looked at yet?**

## How it works

1. **Start tracking.** Every file that already exists counts as seen, so the list
   starts empty, even in a project with thousands of files.
2. **Keep working.** Files created afterwards appear in the **Unopened Files** view
   in the Explorer sidebar. That includes files written by tools outside VS Code.
3. **Just look.** Open a file any way you like (the list, the Explorer, Quick Open) and
   it leaves the list. No checkbox, no extra click.

Commits, branch work and restarts don't reset the list. Files added while VS Code was
closed show up the next time you open the project. A file you've already seen never
comes back as new, even if a branch switch removes it and brings it back.

### What counts as "opened"

"Opened" should mean that a person plausibly saw the file, so:

- The file has to stay the active editor for a moment (1 second by default) in a
  focused window. Flicking through tabs, or an extension that auto-opens files, doesn't
  count.
- Diff views don't count. Looking at a diff isn't reading the file.
- You can still clear a row by hand with **Mark as Opened**.

## Design principles

File First Look follows **HCD (Human-Centred Design)**. It keeps the developer in the
loop without adding work:

- **Informs, never blocks.** No gates, no nagging, no judgement.
- **Uses what you already do.** Opening a file is the signal.
- **Honest signals.** "Opened" isn't claimed lightly (see above).
- **Signal over noise.** Git-ignored files, dependencies, build output and caches never appear.
- **Local and private.** No telemetry, no network, no account, and nothing written into your repository.

More in [docs/design-principles.md](docs/design-principles.md).

## Settings

| Setting                          | Default        | What it does                                                                                                      |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `fileFirstLook.exclude`          | common folders | Globs that are never listed (dependencies, build output, caches…). Changing it never marks existing files as new. |
| `fileFirstLook.respectGitIgnore` | `true`         | Never list files ignored by git. Uses `git ls-files`, which is also the fastest way to scan large repositories.   |
| `fileFirstLook.minimumViewTime`  | `1000`         | Milliseconds a file must stay in view before it counts as opened. `0` counts immediately.                         |

## Commands

| Command                             | Where                   |
| ----------------------------------- | ----------------------- |
| File First Look: Start Tracking     | View welcome, palette   |
| File First Look: Refresh            | View title bar, palette |
| File First Look: Mark as Opened     | Row (inline)            |
| File First Look: Mark All as Opened | View title bar, palette |
| File First Look: Stop Tracking      | View `…` menu, palette  |

## Performance

The extension is built to stay out of the way in large repositories:

- One scan when you start tracking. With git it's `git ls-files`, so ignored folders are never walked.
- No work while tracking is off. While on, it watches only for created and deleted files, never content changes.
- Bursts are batched: hundreds of agent-created files means one git check, and `rm -rf dist` means one update.
- Tested against a 100k-file baseline: a 10k-file delete burst is handled in milliseconds.

## Limitations

These are deliberate scope choices for the first release:

- A single local workspace folder. Multi-root and remote workspaces aren't supported yet.
- Tracking starts when you start it. It can't know which existing files you read before.
- Switching to a branch with files you've never seen lists those files as new.
- Files moved outside VS Code look like new files. Renames inside VS Code keep their status.
  On macOS and Windows, a case-only rename outside VS Code (`readme.md` → `README.md`) is listed as new.
- An agent working in a separate worktree is invisible until its files land in your folder.
- Files inside git submodules are not tracked.
- Use one VS Code window per folder. Two windows on the same folder keep separate, competing state.
- In an untrusted workspace, `.gitignore` is not applied until you trust the folder, because git isn't run there.

## How it compares

We looked for existing tools before building this ([details](docs/why.md#existing-tools)).
Many good extensions track _changes_ for review, with explicit checkboxes, Accept/Keep
buttons, or hooks tied to one agent. As of November 2026 we found none that combines all
of these:

- automatic discovery of new files since a baseline
- clearing on first open, with no explicit action
- persistence across commits, branches and restarts
- support for any agent, without hooks

If you know of one, please open an issue. We'd rather point people to it.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up. The
architecture is described in [docs/architecture.md](docs/architecture.md).

## License

[MIT](LICENSE)
