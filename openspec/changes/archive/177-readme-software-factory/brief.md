---
queue_item: readme-software-factory
queue_hash: sha256:e17f4e5876b8409f5a2ac44e1e9371084b62bcfed9335a9b7ae49e87ba70f02b
planner: null
date: 2026-10-11
---

### Goal

The README intro, the package description and `osq --help` describe what osq is today, a spec-driven software factory, instead of "Strict spec queue". The name stays `osq` and is not spelled out anywhere.

### Context

As of 2026-10-11:

- "Strict spec queue." opens line 3 of `README.md`, the `description` in `package.json`, and the program description in `createProgram` (`src/cli/index.ts`). `tests/cli.test.ts` asserts the CLI description includes `Strict spec queue`.
- The README's next paragraphs still describe the early design: "small, immutable task specs", a watcher handing "each approved spec" to an agent, and "a dead letter queue". They say nothing of briefs, living capability specs, worktrees and land, the validator, or running osq on a server with taps from a phone.
- The user decided on 2026-10-11 to keep the name `osq` as a plain name, like `git` or `jq`, with no expansion.

### Requirements

- Line 3 of the README, the `package.json` description and the CLI description call osq a spec-driven software factory: a human writes briefs and taps decisions, and osq plans, builds, verifies and lands each change against living specs.
- The README intro, up to `## Install`, describes the current flow: brief, plan, approve, run with the watcher's own verify, validate, archive, land, locally or on a server. Keep the line "If a fresh agent could not pick up a task from the files in the repo alone, the files are wrong."
- No text spells out `osq` or calls it a queue. `osq queue` and the brief queue keep their names; they are a feature, not the product.
- The wording leans to precision over volume: verified changes, not output.

### Non-goals

- Renaming the package, the binary, `osq.config.ts`, `~/.osq`, the `OSQ_*` variables, branch names or managed-block markers.
- Rewriting README sections below the intro beyond what the new intro makes wrong.
- Changing the `osq queue` command or the brief queue.

### Notes for planning

- Tests pin README and CHANGELOG wording. Measure which tests read the intro and the descriptions before scoping, and update `tests/cli.test.ts` to the new description.
- Keep the CLI description to one line in `osq --help`.
