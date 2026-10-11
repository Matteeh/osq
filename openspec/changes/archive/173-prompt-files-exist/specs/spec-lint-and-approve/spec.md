# Spec Delta: spec-lint-and-approve

## ADDED Requirements

### Requirement: Entry paths exist
`lintChangeFolder` SHALL report an error for each `entry` path of a task that
the change cannot provide, through `missingEntryFindings` in
`src/core/spec/entry-lint.ts`. An entry SHALL count as provided when any of
these holds:

- it lies inside the change folder;
- the `scope` of that task or of an earlier task of the change covers it, as
  `scopeCoversPath` says;
- with `vcs.enabled` on, it exists at the default branch's tip, as
  `vcs.pathExists` says, or, for a pattern `resolveScope` reads as one,
  `resolveScope` matches it in the project root;
- with `vcs.enabled` off, it exists in the project root, or, for a pattern,
  `resolveScope` matches it there;
- a task of another change whose `readDependencyState` is `approved` or
  `archived` covers it with its `scope`, because approval may stack this
  change on that one.

The error SHALL name the task's file and say `Task <n> entry names <path>,
which is not in <default branch> and no task up to this one creates`, with
`the project` in place of the branch when version control is off. A file that
exists only as an untracked or ignored file in the checkout SHALL be reported,
because a worktree cut from the default branch will not have it.

#### Scenario: Entry names a file no tree has
- **WHEN** `osq lint` runs on a change whose task 1 has `entry: [src/gone.ts]` and neither the default branch nor any scope holds `src/gone.ts`
- **THEN** it exits non-zero with an error on `tasks/1.md` naming `src/gone.ts`

#### Scenario: Entries the change provides
- **WHEN** `osq lint` runs on a change whose task's `entry` holds the path below
- **THEN** it reports as below:

| Entry | Situation | Lint |
|---|---|---|
| `src/a.ts` | committed on the default branch | no entry error |
| `src/new.ts` | task 1's scope names it, and task 2's entry names it | no entry error |
| `src/new.ts` | the same task's scope names it | no entry error |
| `src/dep.ts` | an approved change's task scope names it | no entry error |
| `fixture/.osq/.gitignore` | ignored file present only in the checkout | entry error |
| `src/later.ts` | only task 3's scope names it, and task 2's entry names it | entry error |
