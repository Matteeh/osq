---
queue_item: land-runs-after-command
queue_hash: sha256:8c80cccb04096140af7309d53c091b3719e9cd3116d21ddf568d186210de3edb
planner: null
date: 2026-10-10
---

### Goal

After a change lands, osq runs the command the project configures for that moment, such as `pnpm build`, so no human step follows a land. On a server, the watch service and the server then pick up the new build by themselves.

### Context

As of 2026-10-10:

- 12 of the 16 proposals from 150 to 165 list "Run `pnpm build` so `osq` and the watcher use the new code" under `### After landing`. It fails the phone test: it needs a shell. Forgetting it caused the stale-build incidents after 110–112, 116 and 149.
- `landChange` in `src/core/vcs/land.ts` fast-forwards the checkout, removes the worktree and prints `Kept branch osq/<folder>`. `landAndPublish` in `src/core/vcs/land-publish.ts` wraps it on a server and pushes to `origin`.
- `vcs.prepare` in `src/core/foundation/config-vcs.ts` already runs a project command in a new worktree, in ADR 007's `prepare` role environment.
- The watch service worker (ADR 012) and the server worker (`runServerWorker` in `src/cli/server-worker.ts`) exit 75 on a settled new build between passes, and their supervisors restart them on the new code.
- ADR 012 decision 5 says "The service never builds osq and never runs git." A command that land runs is not the service: land is a command the human runs (ADR 003).

### Requirements

- A new optional config command runs in the checkout after a successful land, and after the push when the land publishes. It does not run when the land stops, refuses, or finds the change already landed.
- Its output streams like the sync's progress, and the land's lines say whether it passed.
- A failed command does not undo the land, which is already on the default branch. The land says it failed, names the command, and exits non-zero, and `osq status` and the inbox show it until it next passes.
- The command gets an ADR 007 role environment, never the model key.
- Without the setting, land behaves exactly as today.
- osq's own `osq.config.ts` sets it to `pnpm build`, and the planner guidance stops suggesting `pnpm build` as an after-landing step when the project configures it.

### Non-goals

- Deploying anything. The command is the project's.
- The watch service building osq by itself.
- Running the command after `osq sync`.

### Notes for planning

- Decide the key's name and place (`vcs.afterLand` beside `vcs.prepare`, or under a land block) and which role environment it uses. Reusing `prepare` is the smallest choice.
- Decide whether to amend ADR 012 decision 5 or write a short ADR, since the build now follows a land automatically.
- Check that a land tapped on the server dashboard and a forwarded `osq land` both run it, and that the server worker's build check then restarts the server only after the land's action has finished.
