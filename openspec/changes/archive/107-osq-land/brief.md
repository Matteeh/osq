---
queue_item: osq-land
queue_hash: sha256:a2b1470f2a8b24f6beaa870bcf8633f4435c5d868b059d5ccb55bc66c0f8f47f
planner: null
date: 2026-09-28
---

### Goal

`osq land <id>` lands a change archived on its `osq/` branch onto the default branch in one command: squash, commit with osq's message, clean up. Two changes that both write the same capability spec land one after the other without a hand-resolved conflict, because osq rebuilds living specs from deltas instead of merging them as text.

### Context

- Today a change lands by hand: `git merge --squash osq/<folder>`, then `osq message <id> | git commit -F -`, then removing the leftover draft `osq status` names. README's "Working with version control on" lists these steps.
- On 2026-09-27, changes 101 and 102 were approved while neither had landed, so both branches were cut from the same `main`. Both appended requirements to `openspec/specs/cli-foundation/spec.md`, and the second squash conflicted. The hand resolution also needed one exact blank line between the two blocks, or `tests/living-specs-delta-equivalence.test.ts` failed.
- Living specs are derived. Archive applies approved deltas deterministically without a model (ADR 002), and a textual merge of a derived file is the wrong tool.
- ADR 003 decision 7 already specifies `osq land`: it squashes, commits with the generated message so the trailers stay in the surviving commit's trailer block, removes the leftover draft when its hash matches the approved one, removes the worktree, never pushes, and refuses when the checkout has uncommitted changes, when the branch has not archived, when the change is stacked on an unlanded dependency, or when the squash conflicts. ADR 003's rule names `osq land` as the only way osq writes `main`.
- `buildSquashMessage` and `osq message` (change 095) build the message.

### Requirements

- `osq land <id>` refuses as ADR 003 decision 7 says, each with a message naming the fix.
- For every living spec the change's archived deltas write, the landed file is the result of applying those deltas, in the change's delta order, to the default branch's current living spec, as archive does. A conflict in such a spec never reaches the human.
- Any other conflict leaves the checkout exactly as it was before `osq land`, never through a history rewrite, and says to run `osq sync <id>`, or to resolve by hand until `osq-sync` lands.
- Before committing, `osq land` runs the change's `verify` on the squashed tree. A red verify leaves the checkout as it was and prints the end of the output.
- The commit's message is what `osq message <id>` prints, trailers intact.
- It removes the leftover draft when its hash matches the approved one, then the worktree. It keeps the branch and does not push.
- README's "Working with version control on" uses `osq land` in place of the hand steps, and keeps the hand steps as the fallback.

### Decide before planning

- Automatic stacking on any unlanded archived change, not only on a `depends_on` change, would also prevent conflicts in code files such as README. ADR 003 rejected one shared workspace because every later change would then depend on every earlier one, and implicit stacking brings that back. Proposed default: no implicit stacking; rebuild specs at land, and let `osq-sync` handle code conflicts.

### Non-goals

- Mode B, pull requests, and pushing.
- Rebasing or rewriting any commit.
- Syncing a branch with `main`. That's `osq-sync`.

### Notes for planning

- Test with real temporary git repos, as `tests/worktree-run.test.ts` does.
- Include the 101 and 102 case as a scenario: two changes cut from the same default branch both add requirements to one capability, and landing both in order gives each living spec what applying both changes' deltas in order gives, with no conflict.
- The command writes the human's checkout, so every refusal is checked before the first write.
