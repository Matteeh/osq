---
title: Turn on version control for osq itself
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - version-control
---
## Goal

osq's own changes run in worktrees on `osq/` branches from the change after
this one. This change sets `vcs.enabled`, `vcs.author`, and `vcs.prepare` in
osq's `osq.config.ts`, and README.md gains a short walkthrough of the
stage-1 flow: approve on the default branch, find the worktree, leave it
alone while a task runs, and land by hand with `osq message`. It is the
first real test of stage 1 of ADR 003.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass with the flag on in osq's
own config. A new test loads osq's own config with `loadConfig` and checks
the three `vcs` values, and checks that README.md holds the walkthrough's
heading and land command. Measured before planning: in a linked worktree
with this config, `pnpm install --frozen-lockfile` and `pnpm verify` pass
(2437 and 88 tests), and `osq doctor` shows no `vcs-prepare` warning.

## Non-goals

- Any change under `src/`.
- Running this change itself in a worktree. The running watcher loaded its
  config at start, with the flag off, so this change runs and archives in
  the checkout like every stage-1 change.
- `osq land`. Landing stays by hand.

## Surface

- Changed: osq's own `osq.config.ts` sets `vcs.enabled: true`, `vcs.author: 'osq <osq@noreply.invalid>'`, and `vcs.prepare: 'pnpm install --frozen-lockfile'` (config values)
- Added: README.md section `### Working with version control on` under `## Version control` (document section)

## Decisions

- ADR 001: the config file still loads through jiti; only values change.
- ADR 003: this is the migration step the ADR names. The flag turns on for the change after stage 1, and osq's commits carry their own author, so they stand apart from the human's squash commit.
- ADR 004: unchanged.
- ADR 005: unchanged.

## Background

`validateVcsConfig` in `src/core/foundation/config-vcs.ts` requires
`vcs.author` as `Name <email>` when the flag is on. The author is a
reserved `.invalid` address so osq's commits never link to a real account.
`osq doctor`'s `vcs-prepare` warning fires when a lockfile exists and
`vcs.prepare` is unset; `pnpm-lock.yaml` is here, so `prepare` silences it.

README.md already describes every vcs behaviour in prose under
`## Version control`. The new subsection is the short path a person
follows, in order, and links nothing new.

`osq watch` reads its config once at start, so the flag takes effect when
the watcher restarts after this change archives.

## Contract

### Requirement: No code change
This change SHALL change no file under `src/`.

#### Scenario: Source untouched
- **WHEN** the change archives
- **THEN** its tasks touched only `osq.config.ts`, README.md, and the new test

## Human steps

### Before approval

None

### After landing

- Wait until no change is running, then stop `osq watch`.
- Bring `main` up to date with this branch (merge the PR), and switch your checkout to `main`. From now on, approve on `main`.
- Run `osq doctor` and check the `vcs` lines show no warning.
- Start `osq watch` again. The next approved change should print `Worktree:` and `Branch:` lines at approval and run in `~/.osq/worktrees/`.
- When that change archives, land it by hand with `git merge --squash osq/<folder>` and `osq message <id> | git commit -F -`, then run `osq verified 100 --passed`. Run `osq verified 100 --failed` if any step fails.

## Delta

- `specs/cli-foundation/spec.md`: adds "osq runs its own changes under version control".

One task.
