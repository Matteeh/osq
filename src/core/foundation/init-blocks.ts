import path from 'node:path';

export const OSQ_START_MARKER = '<!-- OSQ:START -->';
export const OSQ_END_MARKER = '<!-- OSQ:END -->';

/**
 * The seven step lines of the managed `## Executing a task` section, in order.
 * Task 2's shared executor prompt interpolates these verbatim.
 */
export const EXECUTOR_STEPS: readonly string[] = [
  '1. Read your task file, its parent `proposal.md`, then only the delta specs and capability specs it names. Nothing else.',
  '2. Too big for one pass? Write why in `.run/results/<n>.md`, exit without code.',
  "3. Read a previous result file for this task if present. Run the task's `verify`. Start from what fails. A `verify` that names a file your task creates fails until that file exists, so starting red is expected.",
  '4. Tests for each acceptance line before implementing.',
  "5. Minimal code to pass. Write only `.run/results/<n>.md` and files inside the task's `scope`; the task's `scope` wins over any other ownership rule you were given.",
  '6. New test files are always allowed. Change a preexisting test only when the task sets `tests.modify: true` and the file is inside `scope`; any other test change kills the task.',
  "7. Run the task's `verify` command before exiting. Then run the proposal's `verify`; the watcher runs both itself and kills the task if either fails.",
];

/** The result-file headings and their purposes, in the order they must appear. */
export const RESULT_HEADINGS: ReadonlyArray<{ heading: string; purpose: string }> = [
  { heading: '## Changed', purpose: 'what you changed.' },
  {
    heading: '## Deviated',
    purpose: 'for the reviewer: what you did differently from the task, and why.',
  },
  {
    heading: '## Missing context',
    purpose: 'for the planner: what the task lacked that you needed.',
  },
  {
    heading: '## Outside scope',
    purpose: 'for the human: what you found broken outside your scope and left alone.',
  },
  { heading: '## Next', purpose: 'for unfinished work, the acceptance line to pick up next.' },
];

/** The label prefix of the final line listing every changed file except the result file. */
export const RESULT_TOUCHED_PREFIX = 'Touched:';

/**
 * The body lines of the managed `## Exiting` section, including empty separator
 * lines. Rendered from {@link RESULT_HEADINGS} and {@link RESULT_TOUCHED_PREFIX}
 * so the prompt and the managed block name the same headings.
 */
export const EXECUTOR_EXIT_LINES: readonly string[] = [
  'Write `.run/results/<n>.md` first, with these headings in this order. Leave out any that would be empty.',
  '',
  ...RESULT_HEADINGS.map(({ heading, purpose }) => `- \`${heading}\`: ${purpose}`),
  '',
  `End the file with one line, \`${RESULT_TOUCHED_PREFIX} <path>, <path>\`, listing every file you changed other than the result file, relative to the project root.`,
  '',
  'Then exit. One attempt. Do not ask questions.',
];

export const MANAGED_AGENTS_MD_BODY = `${OSQ_START_MARKER}
## Executing a task

You were handed one task, \`tasks/<n>.md\`, from a change under \`openspec/changes/\`.

${EXECUTOR_STEPS.join('\n')}

## Exiting

${EXECUTOR_EXIT_LINES.join('\n')}

## Where things live

- Living capability specs live under \`openspec/specs/\` as \`<capability>/spec.md\`. Never edit them; the watcher applies approved deltas at archive.
- In-flight changes live under \`openspec/changes/<id>-<slug>/\`: \`proposal.md\`, delta specs as \`specs/<capability>/spec.md\`, and one \`tasks/<n>.md\` per task.
- Executors never edit \`tasks.md\` or any file under \`.run/\` except their result file; those belong to the watcher and the human. Planners write \`tasks.md\` and the task files.
- Approval gate: only \`osq approve\`, run by a human, writes \`.run/approved\`. Verification gate: only the watcher's own \`verify\` run marks a task done.

## Planning a change

Planners follow \`PLANNER.md\`. When \`osq plan\` started you, \`plan-prompt.md\` in the selected change folder is your complete prompt; read it and follow it exactly.

- Write only inside that change folder.
- Run \`osq lint <slug>\` and fix every finding before you finish.
- Never run \`osq approve\`; approval belongs to a human.
${OSQ_END_MARKER}`;

/** @deprecated use {@link MANAGED_AGENTS_MD_BODY}; alias kept for existing importers. */
export const MANAGED_AGENTS_BLOCK = MANAGED_AGENTS_MD_BODY;

export const MANAGED_PLANNER_BLOCK = `${OSQ_START_MARKER}
## Planning a change

You write the change folder; a cheaper executor runs it one task at a time,
sees only what you wrote, and reads it literally.

### Interactive planning

When a human is in the session:

1. Read \`AGENTS.md\`, the capability specs this change touches, and one recent
   archived change end to end.
2. Write the change folder. Stop after the task list only when the human asks to
   review it first; then reply with the parent spec, the task list (titles only),
   the capability specs this change will write, and any \`## Human steps\`, and say
   the change folder is not written yet.

### Working from the handoff

When \`osq plan\` started you, \`plan-prompt.md\` in the selected change folder is
your complete prompt; read it and follow it exactly.

### Either way

- Write only inside that change folder.
- Run \`osq lint <slug>\` and fix every finding before you finish.
- Never run \`osq approve\`; a human owns that gate.
- Finish by telling the human, in chat, the task titles, that the change folder
  is written and \`osq lint\` passes, and the exact \`osq approve <id>\` to run. The
  human should not approve before that message.
- Grep for what already exists; verify every version, flag, or API before use.
- Write files with the file tool, never through a shell echo.

### Tasks

- One task per coherent unit. Title is "When X, Y".
- Every task names its \`scope\` and \`verify\` (no TTY, no network). A task that changes a preexisting
  test sets \`tests.modify: true\` and lists that test in \`scope\`; every other preexisting test is
  frozen. \`osq lint\` enforces the configured limits on scope patterns and acceptance lines.
- \`osq init\` and \`osq new\` seed \`verify: node -e "process.exit(0)"\` as a
  planning sentinel, not trusted coverage. \`osq lint\` rejects it; replace it
  before approval with a command that verifies the completed change's final tree.
- Every task's \`verify\` exercises its slice through the real entry point, wiring included. If closing
  the loop requires a file outside the task's \`scope\`, the scope is wrong; widen it or merge the task.
  An executor result that says the work is outside its scope is a planning failure.
- Every task's \`verify\` must stay re-runnable against the final tree of the
  completed change, because the watcher and archive recertification run it there after
  later tasks land. A command that passes only mid-change is a planning failure.
- By default the watcher also runs the change-level \`verify\` after each task, and
  a red result kills that task. Every task must leave it green; tasks that pass
  only together are one task.
- The watcher runs each task's \`verify\` once before the first attempt and expects
  it to fail. A task whose \`verify\` should already pass before any change, such as
  a refactor, declares \`verify_starts: green\`. A task whose \`verify\` names a test
  the task creates declares \`verify_starts: red\`; a new test file may share that
  verify with existing tests. \`any\` is only for a task that can honestly start
  either way.
- A file belongs to one task. Before each later task, the watcher re-hashes the
  resolved \`scope\` of every done task; any change halts the change until a human
  runs \`osq retry\`. Globs resolve again at every audit, so a broad glob also
  captures files that later tasks create. When a later task must extend a file,
  order that later task after the owner, name the shared file in the proposal,
  and list the expected \`osq retry\` under \`## Human steps\`.
- Task bodies carry acceptance lines and the names of existing code to reuse,
  without signature blocks, numbered implementation steps, or line numbers. Write
  full signatures only for ports.
- Refer to functions and files by name, never by line number.

### Parent spec

- \`## Goal\`, then the change-level \`verify\` every proposal declares as the first
  thing written after the goal, then \`## Non-goals\` and the contract as
  requirements with scenarios.
- \`## Surface\` follows \`## Non-goals\` and lists the user-facing names the change
  adds, changes, or removes: commands, flags, config keys, frontmatter fields,
  document sections, dead reasons, and event types. Write \`None\` when there are
  none; \`osq lint\` rejects a proposal without the section.
- The delta is the exact text the capability spec will contain after the change,
  never an instruction to update something.
- Anything a task must not do itself goes under \`## Human steps\`, which never
  includes \`osq approve\`.
- Guidance a task needs about another capability's code, such as how to test
  against it, goes into that capability's spec through a delta, not only into the
  task.
- Replacing a requirement's behavior is a REMOVED requirement plus an ADDED one.
  A MODIFIED requirement must keep every scenario it already has; \`osq lint\` and
  archive refuse one that drops any.
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
