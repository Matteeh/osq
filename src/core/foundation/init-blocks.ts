import path from 'node:path';

export const OSQ_START_MARKER = '<!-- OSQ:START -->';
export const OSQ_END_MARKER = '<!-- OSQ:END -->';

export const MANAGED_AGENTS_MD_BODY = `${OSQ_START_MARKER}
## Executing a spec

1. Read your task file, its parent \`proposal.md\`, then only the delta specs and capability docs it names. Nothing else.
2. Too big for one pass? Write why in \`.run/results/<n>.md\`, exit without code.
3. Read a previous result file for this task if present. Run the task's \`verify\`. Start from what fails.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Stay inside \`scope\`.
6. Run the task's \`verify\` command before exiting.

## OpenSpec layout

- Living capability specs live under \`openspec/specs/\` as \`<capability>/spec.md\`.
- In-flight changes live under \`openspec/changes/<id>-<slug>/\`.
- The change document is \`proposal.md\`; delta specifications live beside it as \`<capability>/spec.md\`.
- The osq workflow schema lives under \`openspec/schemas/osq/\` (proposal -> specs -> tasks).
- \`tasks/<n>.md\` is the osq execution unit; \`tasks.md\` is a write-only projection of \`.run/\` state.
- \`.run/\` markers track execution state: \`running/<n>.pid\`, \`done/<n>\`, \`dead/<n>.md\`, \`regressed/<n>.md\`, and \`approved\`.
- State is derived purely from the marker files on disk; nothing depends on in-memory state.

## Gates and executor permissions

- Approval gate: only \`osq approve\`, run by a human, writes \`.run/approved\` after linting and hashing the change.
- Verification gate: the watcher alone re-runs each task's \`verify\` against the final tree before writing \`done\`.
- An agent writes only \`.run/results/<n>.md\` and files inside \`scope\`; it never edits living capability specs, \`tasks.md\`, or marker files.

## Planning a change

- When asked to plan a change, read \`plan-prompt.md\` in the selected change
  folder and follow it exactly.
- Write only inside that change folder.
- Run \`osq lint <slug>\` and fix every finding before you finish.
- Never run \`osq approve\`; approval belongs to a human.

## Exiting

Write \`.run/results/<n>.md\` first: changed, deviated, missing context, and for unfinished work which acceptance line is next. Omit empty sections. Then exit. One attempt. Do not ask questions.
${OSQ_END_MARKER}`;

/** @deprecated use {@link MANAGED_AGENTS_MD_BODY}; alias kept for existing importers. */
export const MANAGED_AGENTS_BLOCK = MANAGED_AGENTS_MD_BODY;

export const MANAGED_PLANNER_BLOCK = `${OSQ_START_MARKER}
## Planning a change

You write the change folder; a cheaper coding agent executes it one task at a
time and cannot see anything you did not write down. Plan so a literal, narrow
reader succeeds.

1. Read \`AGENTS.md\`, the capability specs this change touches, and one recent
   archived change end to end.
2. Reply with the parent spec, the task list (titles only), the capability specs
   this change will write, and any \`## Human steps\`. Stop there.
3. Write task bodies only after the human approves the list.

### Working from the handoff

- Your complete prompt is \`plan-prompt.md\` in the selected change folder; read
  it and follow it exactly.
- Write only inside that change folder.
- Run \`osq lint <slug>\` and fix every finding before you finish.
- Never run \`osq approve\`; a human owns that gate.

### Before you write a task

- Grep for what already exists; verify every version, flag, or API before use.
- Write files with the file tool, never through a shell echo.

### Tasks

- One task per coherent unit. Title is "When X, Y".
- Every task names its \`scope\`, \`verify\` (no TTY, no network), and the test
  files it may modify. Tests not listed are frozen.
- \`osq init\` and \`osq new\` seed \`verify: node -e "process.exit(0)"\` as a
  planning sentinel, not trusted coverage. \`osq lint\` rejects it; replace it
  before approval with a command that verifies the completed change's final tree.
- Every task's \`verify\` exercises its slice through the real entry point, wiring
  included. If closing the loop requires a file outside the task's \`scope\`, the
  scope is wrong; widen it or merge the task. An executor result that says the
  work is outside its scope is a planning failure.
- Every task's \`verify\` must stay re-runnable against the final tree of the
  completed change, because the watcher and archive recertification run it there
  after later tasks land. A command that passes only mid-change is a planning
  failure.
- A file belongs to one task. A later task may extend it only when it must; order
  that later task after the owner and name the shared file in the proposal.
- Task bodies carry acceptance lines and the names of existing code to reuse,
  without signature blocks, numbered implementation steps, or line numbers. Write
  full signatures only for ports.
- Refer to functions and files by name, never by line number.

### Parent spec

- \`## Goal\`, then the change-level \`verify\` every proposal declares as the first
  thing written after the goal, then \`## Non-goals\` and the contract as
  requirements with scenarios.
- The delta is the exact text the capability spec will contain after the change,
  never an instruction to update something.
- Anything a task must not do itself goes under \`## Human steps\`.
${OSQ_END_MARKER}`;

/**
 * Canonical `.claude/commands/osq-plan.md` body. Claude expands `$ARGUMENTS`
 * with the slug the author passes, so the command resolves the change folder
 * instead of embedding a repository-specific path.
 */
export const MANAGED_CLAUDE_PLAN_COMMAND = `${OSQ_START_MARKER}
# Plan change $ARGUMENTS

Find the change folder under \`openspec/changes/\` for \`$ARGUMENTS\`, then read
its \`plan-prompt.md\` and follow it exactly.

- Write only inside that change folder.
- Run \`osq lint $ARGUMENTS\` and fix every finding before you finish.
- Never run \`osq approve\`; a human owns that gate.
${OSQ_END_MARKER}`;

/** Relative path of the managed Claude command within a project root. */
export const CLAUDE_PLAN_COMMAND_PATH = path.join('.claude', 'commands', 'osq-plan.md');
