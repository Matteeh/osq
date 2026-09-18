# Spec Delta: Status Inspection

## Purpose

Provides operational visibility into active and archived specifications, task states, locks, and event timelines through `osq status` and `osq show`.

## ADDED Requirements

### Requirement: Specification queue status inspection
<!-- source: features/status-inspection.md # Status Inspection, tests/status.test.ts -->
The system SHALL display an overview of active and archived specifications via `osq status`.

#### Scenario: Displaying status queue
- **WHEN** user executes `osq status`
- **THEN** system displays status indicator, spec identifier, task progress, and title for every change folder

### Requirement: Detailed specification inspection
<!-- source: features/status-inspection.md # Delta from Show command, tests/show.test.ts -->
The system SHALL display detailed task lists, metadata, and event timelines via `osq show <id>`.

#### Scenario: Detailed spec inspection
- **WHEN** user executes `osq show <id>`
- **THEN** system resolves the folder across active and archive paths, displaying frontmatter, task execution table, and event timeline
