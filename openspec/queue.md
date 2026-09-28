# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Stage 1 of `decisions/003-git-strategy.md` is complete, and change 100 turned `vcs.enabled` on for this repository. From change 101, osq's changes run in worktrees, are approved on `main`, and land by hand.

Stage 2 is three items, queued on 2026-09-27 after landing 101 and 102 by hand needed a hand-resolved conflict in a living spec: `archived-once`, `osq-land`, and `osq-sync`. Until `osq land` exists, land each change before approving the next.

The inbox dispatcher landed as changes 097 to 101. Capabilities are three items: `capability-relations` landed as 102; `capability-sidecar` and `capability-graph` remain.

Debt cleanup is three items, queued on 2026-09-28: `test-path-meanings`, `traceability-opt-in-once`, and `retire-source-comments`. None depends on stage 2, and none changes what a user sees except `retire-source-comments`, which removes comments from living specs.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [result-none-sections] A result section that says only None counts as empty, however it is written

Depends on: nothing

### Goal

A result section whose content is "None", written as a bullet, in bold, or followed by a short explanation, counts as empty. A task is never killed as `blocked` by `- None.` under `## Blocked`, and `- None.` under `## Deviated`, `## Missing context`, or `## Outside scope` is never counted as a disclosure.

### Context

- `cleanSection` in `src/core/report/result-sections.ts` treats a section as empty only when its trimmed text is exactly `None`, any case, with an optional period.
- `checkBlocked` in `src/watcher/blocked.ts` fails the task with reason `blocked` when `parseResultSections` returns a non-null `blocked`, and `checkBlockedFirst` runs it before any `verify` (change 078). In a consumer project an executor wrote `- None.` under `## Blocked`, and a task whose tests had all passed died as blocked.
- The same parser feeds `readChangeDisclosures` and `countChangeDisclosures`, so `osq report` and the plan prompt's "Recent executor disclosures" count `- None.` as a real disclosure.
- As of 2026-09-27, osq's own archive holds about 170 one-line result sections: 102 are `None.`, 40 are `- None.`, about 12 are `None` followed by `;` or `.` and an explanation (`None; the task is complete.`), and a few start with `Nothing`. No section is `N/A`.
- The executor protocol already says to leave out empty headings. Executors still write them about a quarter of the time.

### Requirements

- A section counts as empty when, after removing a leading list marker (`-`, `*`, `+`, or `1.`) and surrounding emphasis (`*`, `**`, `_`), its text is the word `None`, any case, alone or followed by `.`, `;`, `,`, or `:` and anything after it.
- `None of the fixtures exist; I need a seed script` stays content: `None` followed by a space and more words is a sentence, not an empty marker.
- This applies to every section `parseResultSections` returns, `Touched` included.
- A task whose `## Blocked` holds `- None.` reaches its `verify` as if the heading were absent.

### Non-goals

- Running `verify` when `## Blocked` holds real content, or finishing a blocked task whose verify passes. `## Blocked` stays the executor's explicit request for a human, checked before verify.
- Other words for nothing (`N/A`, `Nothing`, `Not blocked`). None occurs in the archive's empty sections, and guessing at meaning under `## Blocked` risks swallowing a real need.
- Changing the executor protocol text or the dead marker.

### Notes for planning

- One task: `cleanSection` and its tests in `tests/result-sections.test.ts` or a new test file, plus a `checkBlocked` case through the watcher path that `tests/blocked-exit.test.ts` uses.
- Include the archive's shapes as test cases: `None.`, `- None.`, `* **None**`, `None; the task is complete.`, `None. All acceptance lines are satisfied.`, and the counter-case `None of the fixtures exist; I need a seed script`.
- `osq report`'s disclosure counts for archived changes drop once this lands. Check that no report fixture pins a count that includes a bulleted `None`.

## [archived-once] A landed change counts once, even while its worktree is kept

Depends on: nothing

### Goal

After a change lands by hand, osq counts its archive once. Today the kept worktree still holds the archive, so osq sees two archived changes with the same folder, and `osq queue` fails.

### Context

- On 2026-09-27, after changes 101 and 102 landed by hand on `main` with their worktrees kept under `~/.osq/worktrees/osq/`, `osq queue` failed with `Ambiguous queue association for "inbox-wait-log": multiple archived changes (101-inbox-wait-log, 101-inbox-wait-log)`, from `src/core/status/queue-state.ts`.
- `listChanges` in `src/core/status/change-locations.ts` lists changes from every tree the resolver returns: the checkout and each worktree. A landed change's archive is in both.
- `osq message` reads the archive from the kept worktree (change 095), so the worktree cannot simply be dropped from the resolver.

### Requirements

- When the same archived folder is in the checkout and in a worktree, the resolver lists it once, from the checkout, since the checkout's copy is the landed one.
- `osq queue`, `osq status`, bare `osq`, `osq inbox`, and `osq report` each count such a change once.
- `osq message <id>` still works for a change that has not landed.

### Non-goals

- Removing worktrees. That's `osq-land`.

### Notes for planning

- Reproduce with a real temporary git repo: approve and archive a change in a worktree, squash it onto the default branch by hand, keep the worktree, then read the queue and status.
- Check every caller of `listChanges` and `changeTrees` for its own de-duplication before adding one in the resolver.

## [osq-land] osq land lands an archived change in one command, and living specs never conflict

Depends on: archived-once

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

## [osq-sync] osq sync and the watcher keep a change's branch current with main

Depends on: osq-land

### Goal

A change's branch takes in the default branch before its first task and before archive, and on request with `osq sync <id>`, so its archive is computed against current `main` and its land rarely conflicts.

### Context

- ADR 003 decision 5: osq never rebases; to take in `main`, it merges `main` into the branch as a new commit, `osq: <id> sync main`. It does so before the first task (except a stacked dependent whose dependency has not landed), before archive, and on request. A sync is a no-op when `main` is already an ancestor of the branch tip. A blocked change is re-derived after a sync.
- `osq-land` rebuilds living specs from deltas at land and tells the human to run `osq sync <id>` on any other conflict.

### Requirements

- `osq sync <id>` merges the default branch into the change's branch in its worktree as `osq: <id> sync main`, refusing while a task of the change runs.
- A conflict only in living specs is resolved by rebuilding them from the default branch's specs and the change's deltas, as `osq land` does. Any other conflict aborts the merge, leaves the worktree as it was, and halts the change with a reason that names the conflicting files for a human.
- The watcher syncs before a change's first task and before archive, as ADR 003 decision 5 says.
- `osq status` shows the last sync per change.

### Non-goals

- Mode B.
- Resolving code conflicts automatically.

### Notes for planning

- Test with real temporary git repos, including a stacked dependent whose dependency lands during its run.

## [capability-sidecar] Each capability carries a small osq.yml with its group

Depends on: nothing

### Goal

Each capability can carry a small osq-owned sidecar with metadata the OpenSpec spec format has no place for, starting with `group`. Groups are the outermost level of the graph view, and they group capabilities in `osq report`.

### Context

- Capabilities are folders under `openspec/specs/` with no metadata, and the graph view in `packages/ui` has no grouping.
- At change 049, OpenSpec 1.13.1 validated specs cleanly with an extra YAML file beside `spec.md`, and `openspec list --specs` was unaffected. osq still pins 1.13.1 as of 2026-09-27; recheck.
- `AGENTS.md` states that living capability specs change only when the watcher applies an approved delta.
- `capability-relations` adds `creates` to proposal frontmatter.
- In the inventory ERP, a group maps onto a module, such as an inventory group holding costing, reservations and stock movements.

### Requirements

- `openspec/specs/<capability>/osq.yml` holds `group`, a required string, and `tags`, an optional list. Unknown keys fail lint. A missing sidecar is a lint warning, and so is `group: ungrouped`.
- A capability's description is read from its spec's `## Purpose` and never stored in the sidecar.
- `creates` from `capability-relations` takes a group for each new capability, as `creates: [{ name: <capability>, group: <group> }]`. A bare name is rejected with a message showing the new form. At archive, the archiver writes the new capability's sidecar from that entry, so the sidecar is part of the approved change.
- A change may carry a replacement sidecar at `openspec/changes/<id>/specs/<capability>/osq.yml`, validated at lint and applied at archive.
- `osq migrate` scaffolds a sidecar with `group: ungrouped` for any capability without one, for projects adopting sidecars.
- Only those three paths write sidecars: the archiver for `creates`, the archiver for a replacement in a change, and `osq migrate`.
- The approval manifest records sidecar hashes for touched capabilities.
- `getMetricsReport` reports, under `coverage`, capabilities with and without a sidecar.
- The graph view groups capability lanes by `group`.
- A task in the change writes this repository's sidecars, with the groups below.

### Groups for this repository

| Capability | Group |
|---|---|
| cli-foundation | platform |
| spec-lint-and-approve | planning |
| traceability | planning |
| watcher-and-harness | execution |
| version-control | execution |
| status-inspection | inspection |
| web-inspection | inspection |
| metrics-and-reporting | inspection |

### Surface

- File: `openspec/specs/<capability>/osq.yml`, keys `group` and `tags`.
- Frontmatter: `creates` entries with a group.

### Non-goals

- Statuses, overrides, ownership in the sidecar, or project rule settings.
- Changing the spec or delta format.
- Zoom levels and other graph views. That's `capability-graph`.

### Notes for planning

- Add a test that runs the pinned validator over a fixture with sidecars, so compatibility stays checked across upgrades.
- Tests check behaviour on fixtures and never pin this repository's list of capabilities or groups.

## [capability-graph] The graph view zooms from groups down to functions

Depends on: capability-sidecar

### Goal

The graph view in `packages/ui` shows the whole system as one map you zoom into, and each level shows a different kind of detail: groups and capabilities, then requirements and scenarios, then tests and functions. Every node and edge comes from a link osq already checks, so the map is true. It answers the questions an architect or a new developer asks, such as what an ADR governs or what changing a scenario touches.

### Context

- `packages/ui` has a graph view with capability lanes, grouped by `group` after `capability-sidecar`. `osq serve` serves it. Recheck how the UI receives its data.
- `capability-relations` relates every change to a capability through its deltas and reads, makes creation explicit, and gives one ownership reader.
- `capability-sidecar` gives every capability a `group`.
- `traceability-scenarios` (change 081) gives the scenario index, `buildScenarioIndex` in `src/core/trace/scenario-index.ts`, which maps each scenario to the tests that name it and the functions they cover, and the `@scenario` and `@adr` tags on functions.
- `traceability-mutation` (change 083) records surviving mutants per function when it's turned on.
- The ADR reader gives each ADR's status and scope.
- `buildImportGraph` in `src/core/spec/import-graph.ts` knows which files import which.
- `docs-digest` has not landed as of 2026-09-27. If it has by planning time, its archive reader lists the changes that touched each capability.

### Requirements

#### Graph data

- `osq graph --json` prints the graph as nodes and edges with kinds and stable ids. The UI gets the same data from `osq serve`. The format carries a version.
- Node kinds: group, capability, requirement, scenario, test file, function, ADR and change.
- Edges and where they come from:
  - a group contains a capability, from the sidecar
  - a capability contains a requirement, and a requirement contains a scenario, from the living spec
  - an ADR applies to a capability, from the ADR's scope
  - a test proves a scenario and covers a function, from the scenario index
  - a function follows an ADR, from its `@adr` tag
  - a change writes or reads a capability, from its deltas and reads
  - a capability depends on another when a file one owns imports a file the other owns, from the import graph and Code ownership
- Each node carries what its detail panel needs: a capability its Purpose and gap counts, a scenario its THEN lines and tables, a function its file, tags and surviving mutants.
- Gaps are marked: scenarios no test proves, exported functions in a capability's ownership that no scenario claims, and files no capability owns.
- The graph data is built from the existing readers and indexes, and cached by file hash like the scenario index. The same inputs give identical data.

#### Semantic zoom

- **Level 1, the system.** Groups and their capabilities, the dependency edges between capabilities, the ADRs that apply to `all` around them, and gap counts per capability.
- **Level 2, a capability.** Its requirements and scenarios, the ADRs that apply to it, and its gaps in red.
- **Level 3, a scenario.** Its THEN lines and tables, the tests that prove it, and the functions they cover.
- **Level 4, the code.** A function with its tags, its file, its surviving mutants and the last change that touched it.
- Zooming into a node opens its next level, and zooming out returns. The view draws only the current level and its neighbours, so a project with thousands of scenarios stays fast.
- Every node opens a detail panel. From level 4, the panel links to the file.
- For a capability not opted into traceability, levels 3 and 4 aren't available, and the view says traceability isn't on for it.

#### Views that answer questions

- From an ADR: what it governs, meaning the capabilities it applies to and the functions that follow it.
- From a scenario: its blast radius, meaning the tests that name it and the functions they cover.
- A gaps view: every gap across the system.
- From a capability: the changes that touched it, newest first.
- The URL names the current node and level, so any view can be shared.

### Surface

- CLI: `osq graph --json`.
- The versioned graph data format.
- The graph view's levels, question views and URLs.

### Non-goals

- A time slider that replays the graph through the archives. A later change can add it on `docs-digest`'s reader.
- Editing anything from the graph. It only reads.
- Modules' published and consumed events from the ERP. That comes once modules declare contracts.

### Verify

`pnpm verify`, plus tests:

- `osq graph --json` on a fixture has every node and edge kind, each from the right source, with ids stable across runs
- a function carries its tags and surviving mutants, and a scenario carries its THEN lines and table
- an untested scenario, an unclaimed function and an unowned file are each marked as gaps
- a dependency edge appears when a file owned by one capability imports a file owned by another, and not otherwise
- each level shows only its own node kinds and their neighbours, and zooming in and out moves between them
- the ADR, blast radius, gaps and history views return the right nodes on the fixture
- a URL with a node and a level reopens that view
- a capability not opted into traceability shows levels 1 and 2 only, with the message
- on a synthetic project with 2,000 scenarios, each level opens without drawing nodes outside it
- building the graph data twice gives identical output

### Notes for planning

- Build the graph data in core, in its own module fed by the existing readers. The UI only draws.
- The pricing sample from the traceability vision is a fixture for levels 3 and 4. `osq-traceability-vision.md` is not in this repository; ask the human for it or write an equivalent fixture.
- Pick a graph library that handles large graphs in the browser, such as one that draws with WebGL. It belongs to `packages/ui`, not to the CLI's runtime dependencies.
- If `docs-digest` has landed, reuse its archive reader for change edges and the history view.
- This is likely too large for one change. Consider splitting graph data and `osq graph --json` from the zoomable view.

## [test-path-meanings] Each meaning of "test path" has one function, and the spec says which consumer uses which

Depends on: nothing

### Goal

osq has two meanings of "test path", and the split is deliberate, but nothing says so and each meaning is copied by hand. Each meaning gets one named function, every consumer calls it, and the living spec says which meaning each consumer uses.

### Context

As of 2026-09-28:

- **The frozen-test gate's meaning** is `tests` or any path under `tests/`. The watcher's gate snapshots only that folder: `snapshotTestFiles` in `src/watcher/verify.ts` walks the private constant `TEST_DIR_NAME`. Three private copies of the same check follow it: `isTestFilePath` in `src/core/spec/linter.ts` (the `tests.modify` lint), `isTestPath` in `src/core/spec/test-impact.ts` (the frozen-test impact warning), and `isTestPath` in `src/core/spec/digest.ts` (the approval digest's `existingTests`). The comments on the first two say they mirror the `tests/**` default. The copy in `digest.ts` has no comment.
- **The traceability meaning** also counts any file whose name holds `.test.` or `.spec.`. `isTestPath` in `src/core/trace/test-path.ts` is the shared definition, used by traceability lint, the report's traceability gaps, and the system graph. `showIsTestPath` in `src/core/status/show.ts` is a private copy of it.
- The cli-foundation requirement "Test gating configuration" says the configuration loader defines test file patterns, defaulting to `tests/**`. No such configuration key exists. The gate is hardcoded.
- `src/core/spec/test-impact.ts` already imports from `src/core/run/`, so core code under `run/` can serve both spec lint and the watcher.

### Requirements

- One exported function and one exported folder constant define the frozen-test gate's meaning. The watcher's snapshot, the `tests.modify` lint, the impact lint's frozen-test warning, and the approval digest all use them. No private copy remains.
- `show.ts` uses `isTestPath` from `src/core/trace/test-path.ts`. No private copy remains.
- Output doesn't change: the digest, lint findings, `osq show`, the report and the graph print exactly what they print today.
- The living specs state both meanings, and which consumers use each one. The "Test gating configuration" requirement stops describing a configuration key that doesn't exist.

### Non-goals

- Changing either meaning, for example counting `.test.` files outside `tests/` as frozen.
- Making the gate's folder configurable.

### Notes for planning

- One refactor task with `verify_starts: green` should be enough. The delta carries the spec text.
- The delta will probably replace "Test gating configuration" with a REMOVED requirement and an ADDED one, because its scenario names `osq.config.ts` patterns that don't exist, and a MODIFIED requirement has to keep that scenario.
- `src/core/spec/linter.ts` is on the line-budget allow list and holds grandfathered functions. Check both budget tests if the edit shrinks one.

## [traceability-opt-in-once] "Is this capability opted into traceability" is answered in one place

Depends on: nothing

### Goal

The check for whether a capability is opted into traceability is written once and shared, not copied into each file that needs it.

### Context

As of 2026-09-28:

- `isOptedIn` is copied word for word in `src/core/trace/mutation-pick.ts` and `src/core/run/focused-tests.ts`. `src/core/report/report-mutation.ts` has a third copy that takes the bare `capabilities` value.
- The related question "is anything opted in" is answered twice: by `hasOptedInCapability` in `src/watcher/mutation-check.ts`, and inline in `getMutationScores` in `report-mutation.ts`.
- `TraceabilityConfig` and its validator live in `src/core/foundation/config-traceability.ts`, owned by cli-foundation.
- Two readers expand `'all'` into a set of names, and they differ. `readOptedIn` in `src/core/spec/traceability-lint.ts` adds the change's delta capabilities, but `optedInCapabilities` in `src/core/report/report-traceability.ts` doesn't, because the report has no change.

### Requirements

- `config-traceability.ts` exports one function that answers "is this capability opted in", and one that answers "is anything opted in". The five places above use them, and no private copy remains.
- Behaviour doesn't change for `'all'`, for a list, or for the empty default.

### Non-goals

- Merging the two `'all'` expanders, which differ on purpose.
- Changing the traceability config's shape or its validation.

### Notes for planning

- The change writes no delta. It names `traceability` and `cli-foundation` in `features.reads`.
- One refactor task with `verify_starts: green`, plus a small test of the two exported functions over `'all'`, a list, and `[]`.

## [retire-source-comments] Only Code ownership carries a source comment

Depends on: nothing

### Goal

The `<!-- source: ... -->` comment is removed from every requirement in the living specs except `Code ownership`, and planners stop writing new ones. Nothing reads these comments and nothing checks them, so a planner or an agent that trusts one can be sent to a file that has moved.

### Context

As of 2026-09-28:

- All 428 requirements across the 8 living specs carry a source comment. Only the 8 on `Code ownership` requirements are read: `parseCodeOwnership` in `src/core/spec/parser.ts` reads their globs as the capability's owned files.
- 106 of the other comments name at least one path that matches no file, 159 of 1,534 entries in all. For example, web-inspection's comments still name `src/core/web-data*.ts` and `src/core/report.ts`.
- Planners still add them to new deltas: every archived change from 100 to 106 does. No template asks for them. `templates/proposal.md` shows one only on `Code ownership`. Planners copy the habit from the living specs.
- Living specs change only when the watcher archives a change and applies its deltas. `tests/living-specs-delta-equivalence.test.ts` checks that each living spec equals the deterministic merge of every archived delta, replayed with `mergeDelta` from `src/core/spec/delta.ts`. The test already normalizes one past merge change, with `stripLegacyDeltaReferences`.
- The scenario index gives checked links from scenarios to tests and functions (change 081), so a loose "source" hint per requirement adds nothing for traceability.

### Requirements

- The change's own deltas remove the comments. For every living capability, the delta holds a MODIFIED requirement for each requirement except `Code ownership`, with exactly the living text minus its source comment line.
- After this change archives, no living spec in this repository has a source comment outside `Code ownership`, and every other byte is unchanged.
- `osq lint` warns, and never fails, when a delta requirement other than `Code ownership` carries a source comment. The warning says only `Code ownership` keeps one.
- Archive and `mergeDelta` don't change. They keep applying approved text exactly (ADR 002).
- `parseCodeOwnership` and its fallback to backtick paths don't change.
- The delta-equivalence test passes unchanged, because replaying every archived delta ends at the swept living specs.

### Decision

Decided on 2026-09-28: the change's own MODIFIED deltas do the sweep, and a lint warning stops new comments.

- The watcher that archives a change runs the osq build from the main checkout, not the change's branch. So stripping comments in archive code could not take effect at this change's own archive. MODIFIED deltas work on today's merge, because a MODIFIED requirement replaces its whole block. On 2026-09-28, generated MODIFIED deltas for all 8 capabilities merged with today's `mergeDelta` into exactly each living spec minus its comment lines, leaving the 8 `Code ownership` comments.
- Costs accepted: the deltas are large (about 8,900 generated lines), and a MODIFIED requirement puts back its whole block as it was at plan time. If another change edits one of those requirements between planning and archive, this change reverts that edit.

Alternatives considered:

- Archive strips comments, and a second change sweeps after the first lands and the watcher restarts. Rejected: two changes, the equivalence test has to ignore comments in between, and archive would alter approved text.
- Archive strips comments from each capability it rewrites, with no sweep. Rejected: specs no change touches keep stale comments indefinitely, the equivalence test has to ignore them permanently, and archive would alter approved text.
- Keep the comments and check them. Rejected: the repair costs the same big deltas, and every later file move then needs a spec edit.
- Lint warning only. Rejected: the 106 stale comments stay.
- Edit living specs by hand. Rejected: living specs change only at archive, and replaying the archive brings the comments back.

### Non-goals

- Checking that `Code ownership` globs match files.
- Changing archive, the merge, or the delta or spec format.
- Editing archived deltas. Archives are history.

### Notes for planning

- Generate the deltas with a script, from `parseCapabilitySpec` in `src/core/spec/delta.ts`: each requirement's `raw` without its source comment line. Before finishing, merge them into the living specs with `mergeDelta`, and check the result equals each living spec minus the non-ownership comment lines.
- The new lint requirement goes in the spec-lint-and-approve delta beside that capability's sweep, with no source comment of its own.
- Plan this change right before approving it, with no other approved change that writes specs waiting, and land it before approving the next. Re-generate the deltas if any living spec changed since planning.
- One task: the lint warning and its tests. Measure in a scratch worktree for tests that pin lint warning counts.
- The warning is lint's only new rule. Keep it a warning so that an old habit never costs a retry.
