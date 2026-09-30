## ADDED Requirements

### Requirement: Spec command
`osq spec [capability] [requirement]`, registered by `registerSpecCommand` in
`src/cli/spec.ts`, SHALL print what "Living requirement lookup" returns: one
capability name per line with no argument, one requirement name per line with a
capability, and the requirement's block and a newline with both. A failed
lookup SHALL throw a `CommandError` with the lookup's message, so `runCli`
prints it to stderr and exits 1.

#### Scenario: Command listed
- **WHEN** `createProgram()` is inspected
- **THEN** it has a `spec` command with optional `capability` and `requirement` arguments, described as `list living capabilities and their requirements, or print one requirement`

#### Scenario: Requirement printed
- **WHEN** `specCommand('alpha', 'First rule')` runs in a project whose `alpha` spec has that requirement
- **THEN** stdout receives the requirement's block followed by one newline

#### Scenario: Names printed one per line
- **WHEN** `specCommand('alpha')` runs in a project whose `alpha` spec holds "Second rule" and "First rule"
- **THEN** stdout receives `Second rule\nFirst rule\n`

#### Scenario: Unknown capability fails
- **WHEN** `specCommand('missing')` runs in a project whose only living capability is `alpha`
- **THEN** it rejects with a `CommandError` whose message is `No living capability "missing". Capabilities: alpha` and whose exit code is 1, and stdout receives nothing

### Requirement: Spec command documentation
README's command list SHALL name `osq spec`, and README's description of what
an executor reads SHALL say it reads the requirements its task names through
`osq spec`, not whole capability specs.

#### Scenario: README names the command
- **WHEN** `README.md` is inspected
- **THEN** its command list has a line starting `osq spec`, and it no longer says an agent reads "the delta specs and capability docs it names"

### Requirement: Executor requirement reading
Executor step 1 in `EXECUTOR_STEPS` SHALL read exactly: `1. Read your task
file, its parent proposal.md, and the delta specs it names. From living
capability specs, read only the requirements the task or proposal names; osq
spec <capability> <requirement> prints one. Nothing else.`, with `proposal.md`
and `osq spec <capability> <requirement>` in backticks. The repository's
`AGENTS.md` and `.opencode/agent/osq-coder.md` SHALL carry the same block.

#### Scenario: Executor asks for named requirements
- **WHEN** `EXECUTOR_STEPS`, `MANAGED_AGENTS_MD_BODY`, and a prompt from `buildExecutorPrompt` are inspected
- **THEN** each holds the new step 1 and none holds `then only the delta specs and capability specs it names`

#### Scenario: Executor copies current
- **WHEN** `AGENTS.md` and `.opencode/agent/osq-coder.md` are inspected
- **THEN** each managed block holds the new executor step 1

### Requirement: Planner requirement reading
Step 1 of the managed planner block's `### Interactive planning` SHALL read exactly:

```
1. Read `AGENTS.md`, the requirements this change touches, and one recent
   archived change end to end. `osq spec <capability>` lists a living spec's
   requirements and `osq spec <capability> <requirement>` prints one; read
   those, not whole capability specs.
```

The repository's `PLANNER.md` and `templates/PLANNER.md` SHALL carry the same block.

#### Scenario: Planner asks for requirements
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it holds the new step 1 and doesn't hold `the capability specs this change touches`

#### Scenario: Planner copies current
- **WHEN** `PLANNER.md` and `templates/PLANNER.md` are inspected
- **THEN** each managed block holds the new planner step 1

## MODIFIED Requirements

### Requirement: Plan prompt spec list label
The plan prompt's `## Capability Specs` section SHALL start with the sentence
`All living specs. Read the requirements this change writes or whose code it
uses, not whole specs: osq spec <capability> lists them and osq spec
<capability> <requirement> prints one.`, with both `osq spec` commands in
backticks, and SHALL still list every living spec.

#### Scenario: Labeled spec list
- **WHEN** a plan prompt is built for a project with living specs
- **THEN** its `## Capability Specs` section starts with that sentence and lists every `openspec/specs/<capability>/spec.md`

### Requirement: Opencode planner agent configuration
The setup command for the opencode harness SHALL generate `.opencode/agent/osq-planner.md` with restricted planning tool permissions.
The file SHALL use only OpenCode permission keys. Its `bash` permission SHALL be
an ordered pattern map that denies `*`, then allows `osq lint*`,
`pnpm osq lint*`, `npx osq lint*`, `osq spec*`, `pnpm osq spec*`, and
`npx osq spec*`, then denies any command containing a shell operator, so that
under OpenCode's last-match-wins rule the planner can run `osq lint` and
`osq spec` and no other shell command. Its body SHALL end with
`The only shell commands you may run are osq lint <slug> and osq spec.`, with
`osq lint <slug>` and `osq spec` in backticks. Setup SHALL NOT overwrite an
existing planner agent file, and the repository's own
`.opencode/agent/osq-planner.md` SHALL equal the generated file.

#### Scenario: Planner agent permissions and idempotence
- **WHEN** `osq setup` executes with `opencode` harness configured
- **THEN** system generates `.opencode/agent/osq-planner.md` permitting `read`, `edit`, `glob`, `grep`, denying `webfetch` and `websearch`, giving `bash` the lint and spec pattern map, and repeated runs remain byte-identical

#### Scenario: Chained lint command
- **WHEN** the planner's `bash` rules are evaluated against `osq lint 048 && rm -rf x`
- **THEN** the last matching rule denies it

#### Scenario: Spec command allowed
- **WHEN** the planner's `bash` rules are evaluated against `osq spec cli-foundation "Spec command"`, `pnpm osq spec cli-foundation`, and `osq spec cli-foundation; rm -rf x`
- **THEN** the first two are allowed and the last is denied
