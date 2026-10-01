## ADDED Requirements

### Requirement: Report reads each change file once
One `osq report` run SHALL read each task file, `brief.md`,
`.run/manifest.json`, and `proposal.md` at most once, through the same read
scope as its event streams. Every reader in the run SHALL get the same parsed
brief frontmatter, manifest, and proposal, frozen so that changing them
throws. Outside a report run, each read SHALL go to disk, and a read error
SHALL surface as it does from a direct file read. The report's text and JSON
output SHALL be the same as reading every file separately.

#### Scenario: Several archived changes on a queue
- **WHEN** the report runs over a project with three archived changes, each with a proposal, a brief naming a queue item, a manifest with approval flags, and a measured task, and a queue naming the three items
- **THEN** no task file, `brief.md`, `.run/manifest.json`, or `proposal.md` is read more than once, and each is read once

#### Scenario: Two report runs
- **WHEN** the report runs twice in one process
- **THEN** the second run reads each of those files from disk again

#### Scenario: Shared read outside a report run
- **WHEN** code reads one file twice through the shared change-file reader outside any report run
- **THEN** the file is read from disk twice, and a missing file rejects with `ENOENT` both times
