---
queue_item: own-folder-path-gate
queue_hash: sha256:6e85aee8532c5b178139483862c60b60f560e432a49e3b6b047fed637d4e49a6
planner: null
date: 2026-10-23
---

### Goal

A change's folder moves from `openspec/changes/<folder>` to `openspec/changes/archive/<folder>` when it archives. Tests that hard-code the active path pass during the change and break the default branch the moment it lands, so the next approved changes die as `baseline_red`. It happened twice: 302 (fixed by hand in ba515f72) and 308 (e8339c7a), and 308's red tree killed 309 and 310 on 2026-10-23. `osq lint` cannot catch it, because it runs before the tests exist. Make osq catch it when the task that wrote the path finishes.

### Context

As of 2026-10-23:

- Both cases were TypeScript scenario tests that copied the change's own delta (`openspec/changes/<folder>/specs/...`) into a scratch lookup root, because living specs with repeated scenario names make `lookupScenario` refuse.
- Verify already gets `OSQ_CHANGE`, the change folder's path, which points at the archived folder after the move. That is the right way for a test to find its change.
- The watcher's checks after a task's verify passes live in `src/watcher/` (scope audit, frozen tests); dead reasons are listed in `src/watcher/failure-reason.ts`.
- Rust test files do name `openspec/changes/<NNN-slug>` often, but for fixture changes inside scratch repositories, never for a real active change folder.

### Requirements

- After a task's verify passes, the watcher checks every file the task added or changed outside `openspec/`. When one holds the change's own folder name, outside a `//` line comment or a `/* */` block comment, the task dies with a dead marker that names each file and line and says to reach the change folder through `OSQ_CHANGE`.
- Another change's folder name, or the change's name in a comment, does not kill the task.
- A test where a task writes `const SLUG = '<its folder>'` into a new test file sees the task die; the same file with the name in a comment passes.

### Non-goals

- Planning-time lint; the files do not exist yet.
- The Rust run feature; port the gate with the Rust loop.
- Removing duplicate scenario names from living specs.
