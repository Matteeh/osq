## ADDED Requirements

### Requirement: Living requirement lookup
`src/core/spec/requirement-lookup.ts` SHALL read the living specs in the
directory `getSpecsDir` resolves. With no capability it SHALL return the sorted
names of the directories there that hold a `spec.md`; with a capability, that
spec's requirement names in `parseCapabilitySpec` order; with both, that
requirement's `raw` block, from its `### Requirement:` line through its last
scenario. A requirement name SHALL match only an equal name after
`normalizeRequirementName` trims both.

#### Scenario: Capabilities listed
- **WHEN** the lookup runs with no capability in a project whose specs directory holds `beta/spec.md`, `alpha/spec.md`, and an empty `gamma/` directory
- **THEN** it returns `alpha` and `beta`, in that order

#### Scenario: Requirement names listed
- **WHEN** the lookup runs for `alpha`, whose spec holds "Second rule" before "First rule"
- **THEN** it returns `Second rule` and `First rule`, in that order

#### Scenario: One requirement returned verbatim
- **WHEN** the lookup runs for `alpha` and `First rule`
- **THEN** it returns the block exactly as the living spec holds it, including every scenario, and no other requirement's text

### Requirement: Living requirement lookup errors
A capability that the lookup doesn't list SHALL fail with
`No living capability "<capability>". Capabilities: <names>`, naming every
capability comma-separated, and SHALL never read a path built from the unknown
name. A requirement that isn't in the capability's list SHALL fail with
`<capability> has no requirement "<requirement>". osq spec <capability> lists them.`

#### Scenario: Unknown capability
- **WHEN** the lookup runs for `../alpha`
- **THEN** it fails with `No living capability "../alpha". Capabilities: alpha, beta`

#### Scenario: Unknown requirement
- **WHEN** the lookup runs for `alpha` and `first rule`
- **THEN** it fails with `alpha has no requirement "first rule". osq spec alpha lists them.`
