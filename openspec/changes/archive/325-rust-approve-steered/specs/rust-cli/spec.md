## ADDED Requirements

### Requirement: Steered approval through the CLI
`run_cli` with `approve <id>` on a change rust-approve "Steered approval"
approves SHALL leave the change folder as TypeScript's `osq approve` leaves
it: approve seals the revised plan and appends its `approved` event, and
`run_command` then delivers that event to rust-retry "Approval reaction",
which clears the triggers before `run_cli` returns. Its stdout SHALL be
approve's output, its stderr empty and its code 0.

#### Scenario: Steered approvals equal TypeScript's
- **WHEN** `run_cli` runs with the registry's features and the arguments `approve`, `1` in `<root>/repo` of a scratch repository built as `golden/print-steered-goldens.mjs.txt` builds the row's case from the fixture `tests/fixtures/steered-repo`, a copy of rust-approve's `approve-repo`, with an `osq.toml` that git ignores, whose `[vcs]` table sets `enabled` as the case says, `author = "Osq Bot <bot@example.com>"` and `worktreeRoot` to `<root>/worktrees`, and then runs again with the argument `status` after the change folder's `.run/delivered/` is removed
- **THEN** the first run gives code 0, empty stderr, and stdout equal to the approval lines of `tests/fixtures/steered-golden/<case>.txt`, each followed by a newline; its commit and record sections and its `.run/` tree, written as the script writes them, equal the golden's, leaving out of the tree `.run/delivery.lock`, every file under `.run/delivered/`, every `approved` event line, and an event file left with no line; and after the second run every file under the change folder's `.run/` other than `.run/delivered/` keeps the bytes the first run left:

| Case | Git |
|---|---|
| `dead-001` | on |
| `blocked-001` | on |
| `change-001` | on |
| `git-off-001` | off |
