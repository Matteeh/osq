---
queue_item: result-none-sections
queue_hash: sha256:dcc8190c694016b97a1ecfb5f5eab606cccee067ee85eaa73e8ec49e3afc770a
planner: null
date: 2026-09-27
---

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
