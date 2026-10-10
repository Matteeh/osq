---
queue_item: stacked-land-keeps-history
queue_hash: sha256:258c08aed754cffb9ca0d1a7e37a7da418b4289e3287d5e040b49cbdeebcb5a7
planner: null
date: 2026-10-10
---

### Goal

A change stacked on another (162 on 161) syncs with the default branch without conflicts after its dependency lands, when it changed nothing since its dependency's tip that main changed too.

### Context

As of 2026-10-10:

- `osq land` writes the land commit with `commitTree` in `src/core/vcs/git-vcs-land.ts`: the branch's tree with the default branch as its only parent. Main never holds the branch's commits.
- A stacked dependent's branch holds its dependency's original commits. After the dependency lands, `syncWithDefaultBranch` in `src/core/vcs/sync-main.ts` merges main with the merge base at the old main, so every line the dependent changed on top of its dependency conflicts. A trial on 2026-10-10: landing 161 alone on 159 and merging into 162 conflicted in `src/cli/server-worker.ts`, `src/core/web/web-server.ts`, `README.md` and `decisions/014-server-mode.md`.
- A code conflict at land stops the change, and approving its revised plan restarts the branch from main (change 129), so the whole stack above a landed dependency reruns every task.
- Land order deadlocks when a dependency is steered and archives again: on 2026-10-10 `osq land 161` refused with `162-remote-cli archived before 161-osq-server and also writes cli-foundation, web-inspection; land it first, or reject it`, while `osq land 162` refuses because 162 is stacked on unlanded 161, and `osq reject` refuses archived changes. `assertNoEarlierChange` in `src/core/vcs/land-checks.ts` should skip a change stacked on the one being landed, and no refusal should suggest a command that cannot run.

### Requirements

- After a dependency lands, syncing its stacked dependent takes main without conflicts in lines only the dependency and the dependent changed.
- osq never rewrites history (ADR 003), and agents still never run git.
- Main's history stays one commit per landed change, or the change writes an ADR saying why not.

### Non-goals

- Resolving real conflicts between unrelated changes; those still stop and restart.

### Notes for planning

- Options to weigh: a land commit with the branch tip as a second parent, or a sync that merges the dependency's land commit with the dependency's branch tip as the merge base. Bring them to the user with a recommendation.
- Test with a three-change stack in a temporary repo: land the bottom, then sync and land the next.
