# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Capability command
`createProgram` SHALL register, through `registerCapabilityCommand` in
`src/cli/capability.ts`, a `capability` command with the description
`generate the deltas that rename or split a capability into a change`, listed
last in the Plumbing help group. It SHALL have two subcommands:

- `rename <old> <new>`, described `move every requirement of <old> to <new>`.
- `split <old>`, described `move the requirements a map file names out of <old>`,
  with a required `--map <file>`, a YAML map read relative to the working
  directory.

Each SHALL take a required `--change <id>` and run `generateCapabilityMove`
through `capabilityRenameCommand` or `capabilitySplitCommand`. Each takes the
command inputs, as `landCommand` does, and loads `osq.config.ts` and reads
the map inside its error handling. On success it SHALL print `wrote <path>`
to stdout for each written path, relative to the change folder, then
`<n> file(s) outside the specs name <old>; proposal.md lists them`, and exit
zero. On any failure, a map that cannot be read or parsed included, it SHALL
print `Error: <message>` to stderr and exit one. With `OSQ_SERVER` set,
`osq capability` SHALL refuse as a local-only command. README's Plumbing
block SHALL list
`osq capability rename <old> <new> --change <id>` and
`osq capability split <old> --map <file> --change <id>`.

#### Scenario: Rename through the CLI
- **WHEN** `osq capability rename gadgets widgets --change 002` runs in a project where `gadgets` has a living spec and `002` is unapproved
- **THEN** stdout is `wrote specs/gadgets/spec.md`, `wrote specs/widgets/osq.yml`, `wrote specs/widgets/spec.md`, then `<n> file(s) outside the specs name gadgets; proposal.md lists them`, and it exits zero

#### Scenario: Split through the CLI
- **WHEN** `osq capability split gadgets --map map.yml --change 002` runs with a valid `map.yml`
- **THEN** `002` holds the deltas "Generated move map" describes, and it exits zero

#### Scenario: Missing map file
- **WHEN** `--map missing.yml` names no file
- **THEN** it prints `Error: ` and the read failure to stderr, exits one, and writes nothing

#### Scenario: Help group
- **WHEN** `osq --help` prints
- **THEN** the Plumbing group lists `new`, `lint`, `queue`, `sync`, `message`, `migrate` and `capability`, in that order
