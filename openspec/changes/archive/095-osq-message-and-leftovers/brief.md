---
queue_item: osq-message-and-leftovers
queue_hash: sha256:aa7f6a7c26a73067a00ffec94d91d0df2c63caf7882a5efd4a9086b04dc451cf
planner: null
date: 2026-09-26
---

### Goal

A change landed by hand keeps its trailers, a leftover draft after a hand landing is flagged, and tests run by hand in a worktree find their change. This completes stage 1.

### Context

- ADR 003 decisions 1, 2, 7 and 11. This is change 7 of stage 1.
- A hand-run `git merge --squash osq/<folder>` does not refuse over the untracked leftover draft, because the branch only adds the archive folder. Tested on 2026-09-26.

### Requirements

- `osq message <id>` prints the squash commit message and writes nothing. Its subject is `osq: <id> <folder words>`, its body is the proposal's `## Goal` and one outcome line per task, and its trailer block holds `Osq-Change`, `Osq-Base`, `Osq-Head`, `Osq-Approved`, `Osq-Approved-By`, and `Osq-Model` once per model used. It also prints the branch to squash.
- For a stacked change whose dependency has not landed, `osq message` names the dependency to land first.
- After a change lands, `osq status` flags a checkout copy of its draft whose hash matches the approved hash, and prints the command that removes it.
- The traceability helper, when `OSQ_CHANGE` is unset inside an osq worktree, finds the change from the branch `osq/<folder>` by reading the worktree's `.git` file and `HEAD` file, never by spawning git.
- README.md's "Not yet" drops the worktree and `scope_violation` entries and keeps the sandbox for enforcement.

### Non-goals

- `osq land`. That is stage 2.

### Notes for planning

- The traceability helper ships in `@matteeh/osq/testing` and runs inside every test process, so it must stay cheap.
