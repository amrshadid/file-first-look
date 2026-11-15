# Why File First Look exists

## The problem

When coding agents write code, the bottleneck moves from writing to **understanding**.
An agent session can add dozens of files in minutes, and parallel sessions multiply
that. Developers review what they asked about. The files they never open become code
that nobody on the team has read.

That is a code-quality problem even when the code is good. Unread code can't be
questioned, debugged quickly or owned. Bugs in it surface later, and they're more
expensive to fix.

## What research says

We cite only sources we have read. Where a finding is limited, we say so.

- **Comprehension debt is recognised.** Practitioners building software-engineering
  agents name _comprehension debt_ (generated code outpacing human understanding) as a
  key challenge (Lyu et al., 2026, [arXiv:2607.10856](https://arxiv.org/abs/2607.10856)).
  A study of 621 developer diaries describes black-box acceptance and skipped
  verification (Ahmad, 2026, [arXiv:2604.13277](https://arxiv.org/abs/2604.13277)).
- **Understanding drops with AI assistance.** In a randomized trial, AI-assisted
  developers scored about 17 points lower on comprehension, with the largest gap on
  debugging (Shen & Tamkin, 2026, [arXiv:2601.20245](https://arxiv.org/abs/2601.20245)).
- **Human oversight still matters.** Across 278,790 review conversations, AI-generated
  code needed 11.8% more review rounds, and the authors conclude that "human oversight
  remains critical" (Zhong et al., 2026, [arXiv:2603.15911](https://arxiv.org/abs/2603.15911)).
- **Parallel sessions are hard to follow.** In the pre-study survey of the ParallelPilot
  user study, 11 of 16 developers said concurrent agent sessions were difficult to track
  ([arXiv:2609.33113](https://arxiv.org/html/2609.33113), §6.2). This describes their
  prior experience; the study did not test a tool like ours.
- **A counterpoint.** One study found reviews became faster and less detailed for
  developers working with agents, but the control group showed the same trend (Hamza et
  al., ESEM 2026, [DOI](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESEM.2026.67)).
  So we don't claim agents _cause_ shallow review. We claim that more generated files
  make unseen files more likely.

## Existing tools

We surveyed the VS Code Marketplace, Open VSX, JetBrains and Neovim plugins, and the
review features of AI editors in November 2026. We read the documentation of each tool;
we did not install them.

The common pattern is **change review with an explicit action**:

- **Built-in agent review** in VS Code, Cursor, Zed, Kiro and JetBrains: Keep/Accept
  buttons or "viewed" marks. These usually cover only edits made by the editor's own
  agent, not files written from a terminal.
- **Review-checklist extensions** (e.g. Seen It, Redline for Claude Code, File Reviewed
  Tracker, AI Change Review): baselines and change lists, cleared with a checkbox or a
  "mark as reviewed" command. Some depend on one agent's hooks or reset on commit.
- **Read/unread markers** (e.g. filemarker): manual toggles, with no new-file detection.
- The one implicit-read analogue we found, Markdown Inbox, marks Markdown files read when
  you scroll to the end, inside its own reader.

File First Look is deliberately narrower and earlier in the workflow. It doesn't do diffs
or accept/reject. It answers one question, which files are new and unopened, using a
signal you already produce: opening the file. It is complementary to the tools above,
not a replacement.

## How we'll know if it works

We're validating with a small pilot of developers who run agents in parallel. File First
Look is worth continuing if pilot users:

- find files they wanted to see and would otherwise have missed, and
- come back to the list on later agent runs without being asked.

If the list turns out to be mostly noise, or files people already catch, we'll narrow
the defaults or stop. We won't add features to compensate.
