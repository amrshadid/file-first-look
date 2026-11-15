# Design principles

File First Look follows **HCD (Human-Centred Design)**: we design around the people who
use the tool, their goals, context and limits, and we evaluate with them. Our user is a
developer who directs coding agents and stays accountable for what ships.

Use these principles to judge features, defaults and pull requests.

## 1. Keep the human in the loop

The developer decides what deserves attention. The tool makes unseen files visible,
then gets out of the way. It never blocks a commit, nags or scores anyone.

## 2. Use signals people already produce

Opening a file is the signal. Requiring an extra click to "mark as read" would be work
people skip, and the list would stop being true. The manual **Mark as Opened** command
is an escape hatch, not the main path.

## 3. Keep signals honest

"Opened" should mean that a person plausibly saw the file:

- Diff views don't count.
- A file must stay active for a short time (`minimumViewTime`) in a focused window.
  That way tab-cycling and extensions that auto-open files can't clear rows.

When in doubt, prefer keeping a row over clearing it wrongly.

## 4. Signal over noise

A noisy list gets ignored, so noise defeats the purpose. Git-ignored files, dependencies,
build output and caches are excluded by default, and exclusions are easy to extend.
Changing exclusions never floods the list with old files.

## 5. Improve code quality through awareness

We don't review code. We make sure every new file gets a chance at a human look, because
unseen files are where unowned bugs hide.

## 6. Respect the user

- Local only: no telemetry, no network calls, no account.
- Nothing is written into your repository.
- Works with any agent or tool, with no integration required.
- Costs nothing while tracking is off and very little while it's on.

## 7. Stay small

Every feature has to help a developer notice unseen files. If it doesn't, it belongs in
a different tool. We would rather do one thing reliably than many things loosely.
