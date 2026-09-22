# Spec Delta: CLI Foundation

## MODIFIED Requirements

### Requirement: Opencode planner agent configuration
<!-- source: src/harness/opencode/opencode.ts, tests/opencode-planner-setup.test.ts -->
The setup command for the opencode harness SHALL generate `.opencode/agent/osq-planner.md` with restricted planning tool permissions.
The file SHALL use only OpenCode permission keys. Its `bash` permission SHALL be
an ordered pattern map that denies `*`, then allows `osq lint*`,
`pnpm osq lint*`, and `npx osq lint*`, then denies any command containing a
shell operator, so that under OpenCode's last-match-wins rule the planner can
run `osq lint` and no other shell command. Setup SHALL NOT overwrite an existing
planner agent file.

#### Scenario: Planner agent permissions and idempotence
- **WHEN** `osq setup` executes with `opencode` harness configured
- **THEN** system generates `.opencode/agent/osq-planner.md` permitting `read`, `edit`, `glob`, `grep`, denying `webfetch` and `websearch`, giving `bash` the lint-only pattern map, and repeated runs remain byte-identical

#### Scenario: Chained lint command
- **WHEN** the planner's `bash` rules are evaluated against `osq lint 048 && rm -rf x`
- **THEN** the last matching rule denies it
