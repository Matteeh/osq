## MODIFIED Requirements

### Requirement: Show command
`osq-feature-show` SHALL expose one public item, `ShowFeature`, a unit
struct that implements core's `Feature`. Its `name()` is `show`. Its
`commands()` are two `Command`s, in this order: `show`, with the summary
`show detailed change information, tasks, and event timeline` and the usage
`<id>`; then `spec`, with the summary
`list living capabilities and their requirements, or print one requirement`
and the usage `[capability] [requirement]`. `run` refuses every other command with
`FeatureError::unknown_command` naming the invocation's command. The crate
depends on no other feature crate.

#### Scenario: Show feature commands
- **WHEN** a test asks `ShowFeature` for its name and commands, and runs it with the command `inbox` and no arguments on a scratch project root
- **THEN** its name is `show`, it lists exactly the `show` command and then the `spec` command with those summaries and usages, and the run returns `FeatureError::unknown_command` displaying as `unknown command: inbox`

## ADDED Requirements

### Requirement: Spec command
`spec` SHALL print what TypeScript's `specCommand` prints through
`lookupRequirement`, reading the living specs under `<root>/openspec/specs`
with the specs kernel. An empty argument counts as a missing one, as
TypeScript's check does.

- The capabilities are the names of the folders directly under
  `openspec/specs` that hold an entry named `spec.md`, file or not, sorted by byte order; a missing
  `openspec/specs` gives none.
- With no capability, `spec` prints each capability on its own line.
- With a capability that is not one of them, `spec` fails with
  `No living capability "<capability>". Capabilities: <capabilities joined by ", ">`
  and reads no path built from the argument.
- With a capability and no requirement, `spec` reads its `spec.md` with the
  specs kernel's `read_living_spec` and prints each requirement's `name` on
  its own line.
- With a requirement too, `spec` prints the `raw` block, then a newline, of
  the first requirement whose `name` equals the argument after the specs
  kernel's `normalize_requirement_name`. With none, `spec` fails with
  `<capability> has no requirement "<requirement>". osq spec <capability> lists them.`,
  naming the requirement as given.

A failure is `FeatureError::failed("spec", <message>)`, so the CLI writes
`spec failed: <message>` and a newline to stderr and exits 1. A `spec.md`
that cannot be read fails with the `SpecsError`'s display as the message.

#### Scenario: Spec equals TypeScript's
- **WHEN** a test runs `spec` with each row's arguments of `crates/features/show/tests/fixtures/spec-golden/spec.json`, on `crates/features/show/tests/fixtures/spec-project/` for the root `project` and on a new empty folder for the root `empty`
- **THEN** a row with code 0 gives output text equal to its `stdout`, and a row with code 1 gives a `Failed` error for the command `spec` that displays as `spec failed: ` and its `stderr` without the final newline:

| Row | Arguments | Result |
|---|---|---|
| `capabilities` | none | `alpha`, `beta` |
| `capabilities-blank-argument` | empty | `alpha`, `beta` |
| `alpha-requirements` | `alpha` | `First rule`, `Closed name`, `Last rule` |
| `alpha-requirements-blank-argument` | `alpha`, empty | `First rule`, `Closed name`, `Last rule` |
| `beta-no-requirements` | `beta` | no output |
| `first-rule` | `alpha`, `First rule` | the `First rule` block |
| `closed-name-padded` | `alpha`, `  Closed name  ` | the `Closed name ##` block |
| `closed-name-hashes` | `alpha`, `Closed name ##` | the `Closed name ##` block |
| `last-rule` | `alpha`, `Last rule` | the `Last rule` block without its trailing blanks |
| `unknown-capability` | `gamma` | `No living capability "gamma". Capabilities: alpha, beta` |
| `folder-without-spec` | `notes` | `No living capability "notes". Capabilities: alpha, beta` |
| `path-like-capability` | `../alpha` | `No living capability "../alpha". Capabilities: alpha, beta` |
| `unknown-requirement` | `alpha`, `first rule` | `alpha has no requirement "first rule". osq spec alpha lists them.` |
| `fenced-header` | `alpha`, `Fenced header` | `alpha has no requirement "Fenced header". osq spec alpha lists them.` |
| `empty-root-capabilities` | none | no output |
| `empty-root-unknown` | `alpha` | `No living capability "alpha". Capabilities: ` |

#### Scenario: Spec read failure
- **WHEN** a test runs `spec` with the argument `alpha` on a new folder whose `openspec/specs/alpha/spec.md` is a folder
- **THEN** it gives a `Failed` error for the command `spec` whose display starts with `spec failed: ` and the path of that `spec.md`

### Requirement: Spec arguments
Before it reads any file, `spec` SHALL take at most two arguments. With more,
it fails with
`FeatureError::usage("spec", "expected [capability] [requirement]")`;
TypeScript's command parser refuses them with its own text.

#### Scenario: Spec argument errors
- **WHEN** a test runs `spec` with the arguments `a`, `b` and `c` on a root that holds no `openspec/` folder
- **THEN** it gives a `Usage` error that displays as `usage of spec: expected [capability] [requirement]`
