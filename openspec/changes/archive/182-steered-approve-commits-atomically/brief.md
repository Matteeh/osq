---
queue_item: steered-approve-commits-atomically
queue_hash: sha256:3e01476cc2d876203039904fbf4f00f34f77bceda8a032bde8d39dd948d70d66
planner: null
date: 2026-10-12
---

### Goal

Approving a revised plan in a worktree either seals and commits the change folder, or leaves no seal behind. A human never has to run git to recover from a half-done re-approval.

### Context

As of 2026-10-12:

- `approveSteeredChange` in `src/core/spec/approve-steer.ts` calls `writeApprovalSeal`, then `vcs.commit([relativeFolder], 'osq: <id> approved', author)`. If the commit throws, the seal stays and nothing removes it.
- On 2026-10-11 the re-approval of 173 wrote `.run/approved`, `manifest.json` and `plan.jsonl` in the worktree, but no `osq: 173 approved` commit exists. `osq retry 173 3` was accepted because the folder hash matched the seal, and 0.1 s later the watcher halted the change with `worktree_dirty`, listing `proposal.md` and `tasks/3.md`. The human committed the folder by hand and ran `osq retry 173 change`. Post-mortem: Notion "Why 173 task 3 died and the re-approval halted (2026-10-11)". What made the commit fail is not known; an `index.lock` clash with the running watcher fits the timing.

### Requirements

- When the approved commit fails, the steered approve removes the seal files it wrote, leaves the plan edits in place, and exits non-zero with the git error and the command to run again.
- A steered approve whose commit succeeds behaves as today.
- `osq retry` refuses, with a message naming the files, while a change's authored files (`proposal.md`, delta specs, `tasks.md`, `tasks/*.md`) differ from the worktree's last commit. Nothing else changes about retry.
- If the commit can fail because the watcher holds git at the same moment, the approve waits for or retries the lock rather than failing; the planner confirms the cause first.

### Non-goals

- Changing the non-steered approve path, which commits on the default branch.
- Changing steering triggers or `osq plan`.

### Notes for planning

- First try to reproduce the failed commit in a test: a commit that throws after the seal is written.
- `halt-recovery-scenarios` (172) built scenario helpers in `recovery-support.ts`; a scenario from failed commit to resumed run fits there.
