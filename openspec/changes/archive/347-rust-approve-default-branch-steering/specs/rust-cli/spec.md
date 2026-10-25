## ADDED Requirements

### Requirement: Default-branch approval through the CLI
`run_cli` with `approve <id>` on a change with a default-branch trigger
SHALL leave the change as TypeScript's `osq approve` leaves it past any
trigger other than `conflict`: approve merges the default branch inline as
rust-approve "Default-branch approval" says, or approves in place with git
off as rust-approve "Steered approval" says, and `run_command` then
delivers its `approved` event to rust-retry "Approval reaction", which
clears the triggers before `run_cli` returns. A conflict reopens the tasks
rust-approve "Conflict reopen" names and the reaction clears the change's
trigger; an approval stop keeps it. Its stdout SHALL be approve's output,
its stderr empty and its code 0, or, for a stop, its stdout empty, its
stderr the `Failed` error's display and a newline, and its code 1.

#### Scenario: Default-branch approvals equal TypeScript's
- **WHEN** `run_cli` runs with the registry's features and the arguments `approve`, `1` in `<root>/repo` of a scratch repository built as `golden/print-default-branch-goldens.mjs.txt` builds the row's case from the fixture `tests/fixtures/steered-repo`, with an `osq.toml` that git ignores, whose `[vcs]` table sets `enabled` as the case says, `author = "Osq Bot <bot@example.com>"` and `worktreeRoot` to `<root>/worktrees`
- **THEN** it gives code 0, empty stderr, and stdout equal to the approval lines of `tests/fixtures/default-branch-golden/<case>.txt`, each followed by a newline; and its `commits:`, `branches:` and `record:` lines and its `tree:` of the change folder's `.run/`, written as the script writes them, equal the golden's, leaving out of the tree `.run/delivery.lock`, every file under `.run/delivered/`, every `approved` event line, and an event file left with no line, with the `synced` line's `duration` any number:

| Case | Git |
|---|---|
| `merge-001` | on |
| `merge-noedit-001` | on |
| `requirement-001` | on |
| `git-off-001` | off |

#### Scenario: Conflicts through the CLI
- **WHEN** `run_cli` runs with the registry's features and the arguments `approve`, `1` on a repository built as rust-approve "Conflicts reopen the owning tasks" builds the row's case from `tests/fixtures/steered-repo`, with done tasks 1, 2 and 3
- **THEN** it gives the row's code, and the change folder's `.run/` holds the row's files:

| Conflicted file | Code | Files |
|---|---|---|
| `src/beta.js` | 0, stdout ending `  Reopened tasks 2 and 3 (src/beta.js conflicted); kept task 1\n  Continues from task 2\n` | `regressed/change.1.md` with `reason: sync_conflict`, no `regressed/change.md`, `events/change.jsonl` ending with a `retry` line for `change` with attempt 2, `done/1`, `done/2.1` and `done/3.1` |
| `src/delta.js` | 1, stdout empty | `regressed/change.md` with `reason: sync_conflict` and the message of rust-approve "Conflicts no task owns stop for planning", no `regressed/change.1.md`, `events/change.jsonl` holding no `retry` line, `done/1`, `done/2` and `done/3` |
