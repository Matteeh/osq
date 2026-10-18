---
queue_item: lint-brace-scope
queue_hash: sha256:291382894180759b5bf222a178327607937bfe21c7e3726f0185f835028780e6
planner: null
date: 2026-10-18
---

### Goal

A planner who writes a brace pattern such as `tests/golden/{a,b}.json` in a task's `scope` gets a lint error at plan time, instead of a task that dies of `scope_violation` while it runs.

### Context

As of 2026-10-18:

- osq's scope matcher, `globToRegExp` and `isPatternEntry` in `src/core/run/scope.ts`, supports `*`, `**`, `?` and a trailing `/`. An entry with none of them is an exact path.
- Change 211's task 3 declared `crates/kernel/storage/tests/golden/{pauses,recertifications,...}.json`. `osq lint` passed it, since an exact path that does not exist yet is a file the task may create. The executor then wrote the nine files, the git guard counted each as outside scope, and the attempt died of `scope_violation`. The second attempt stopped as blocked, and the plan had to be steered.
- The same entry in `entry` would name a file that never exists.
- Paths with `[` and `]` are real in some projects, such as Next.js routes like `app/[id]/page.tsx`, so brackets must stay allowed as literal characters.

### Requirements

- `osq lint` reports an error for a `scope` entry that holds a brace group with a comma, such as `{a,b}`, naming the task file, the entry, and that osq scope globs support only `*`, `**`, `?` and a trailing `/`. The fix it suggests is a folder glob or one entry per file.
- The planner checks whether `entry`, `tests` or any other path list in task frontmatter needs the same rule, and applies it where a brace group can be written.
- A test proves the error on a fixture change, and that an entry with `[` and `]` and no brace group passes.

### Non-goals

- Supporting brace expansion in the scope matcher.
- Any change to how the git guard or the scope audit resolves globs.
