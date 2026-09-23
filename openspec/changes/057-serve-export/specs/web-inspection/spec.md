# Spec Delta: Web Inspection

## ADDED Requirements

### Requirement: Static dashboard export
<!-- source: src/core/web/web-export.ts, packages/ui/vite.config.ts, tests/web-export.test.ts -->
`exportDashboard` SHALL write the built UI into an empty or missing target
directory, together with a `data.js` that assigns `window.__OSQ_DATA__` and an
`index.html` that loads `data.js` before the application bundle. The inlined
documents SHALL be the report, graph, and inbox, plus every active, archived,
and rejected change document, keyed by its folder key and by its id prefix.
Every string in them SHALL have the absolute project root replaced by `.` and
then the home directory replaced by `~`. The built UI SHALL reference its
assets through relative paths. A non-empty target SHALL be refused without
writing.

#### Scenario: Offline snapshot
- **WHEN** a fixture project is exported
- **THEN** the target holds `index.html`, `data.js`, and the assets, and `data.js` covers every route's documents

#### Scenario: Scrubbed paths
- **WHEN** captured output contains the project root and home directory
- **THEN** no written file contains either absolute path

#### Scenario: Occupied target
- **WHEN** the target directory contains a file
- **THEN** the export fails naming the directory and writes nothing
