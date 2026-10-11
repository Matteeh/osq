# Spec Delta: cli-foundation

## ADDED Requirements

### Requirement: Product description
README's third line and the `description` in `package.json` SHALL both be
exactly `A spec-driven software factory. You write briefs and tap decisions;
osq plans, builds, verifies and lands each change against living specs.` The
root command's description in `osq --help` SHALL be exactly `Spec-driven
software factory: you brief and decide; osq lands verified changes.`, which
fits in commander's 80-column help width so it prints on one line. None of the
three SHALL say `Strict spec queue`.

#### Scenario: Product description text
- **WHEN** README's third line, `package.json`'s `description` and `createProgram().description()` are read
- **THEN** each equals its text below:

| Source | Text |
|---|---|
| README line 3 | `A spec-driven software factory. You write briefs and tap decisions; osq plans, builds, verifies and lands each change against living specs.` |
| `package.json` `description` | `A spec-driven software factory. You write briefs and tap decisions; osq plans, builds, verifies and lands each change against living specs.` |
| root command description | `Spec-driven software factory: you brief and decide; osq lands verified changes.` |

#### Scenario: Description on one help line
- **WHEN** `osq --help` is printed at commander's default 80-column width
- **THEN** the line `Spec-driven software factory: you brief and decide; osq lands verified changes.` appears whole on one line

### Requirement: README intro describes the flow
README's intro, the text before `## Install`, SHALL walk the current flow:
brief, plan into a change folder, approve, the watcher's own verify of each
task, the optional validator, archive, `osq land`, and running on a server
with taps from a phone. It SHALL keep the fresh agent line and SHALL not
contain the word `queue`.

#### Scenario: Intro names each step
- **WHEN** README's intro is read
- **THEN** it contains each of `brief`, `change folder`, `living capability specs`, `approve`, `verify`, `validator`, `archives`, `` `osq land` ``, `` `osq server start` `` and `phone`

#### Scenario: Intro keeps the fresh agent line
- **WHEN** README's intro is read
- **THEN** it holds the line `If a fresh agent could not pick up a task from the files in the repo alone, the files are wrong. Everything here follows from that.`

#### Scenario: Intro is not a queue
- **WHEN** README's intro is read, ignoring case
- **THEN** it does not contain `queue`
