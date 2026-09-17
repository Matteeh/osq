# Spec Lint and Approve

Describes the human gate: parsing, linting, hashing, and sealing change specifications before execution.

## Spec Format & Parsing

Each change folder under `specs/<id>-<name>` contains:
- `spec.md`: High-level contract and feature deltas with YAML frontmatter:
  - `title`: Human-readable spec title.
  - `depends_on`: Array of prerequisite spec IDs (e.g. `[001]`). Normalized to 3-digit strings.
  - `features.reads`: Feature docs that provide context for the change.
  - `features.writes`: Feature docs modified by the watcher when the change completes.
  - Markdown sections: `## Goal`, `## Contract` (markdown table), `## Non-goals`, and `## Delta`.
- `tasks.md`: Markdown task list with checkboxes tracked by the watcher.
- `tasks/<n>.md`: Unit of work executed by a coding agent:
  - `title`: Task description ("When X, Y happens").
  - `verify`: Single verification shell command (no chaining with `&&`, `;`, or `|`).
  - `scope`: Glob patterns bounding file access (maximum files governed by `limits.maxScopeFiles`).
  - `entry`: Primary entry files.
  - `skills`: Optional skills.
  - `## Acceptance`: Checklist of up to `limits.maxAcceptanceLines` test criteria.

## Lint Rules

Validated during `osq approve <id>` against limits from `osq.config.ts`:
- Reject if task `scope` exceeds `limits.maxScopeFiles` (default: 8).
- Reject if `features.writes` exceeds `limits.maxFeatureWrites` (default: 2).
- Reject if more than `limits.maxContractTables` (default: 1) markdown table exists under `## Contract`.
- Reject if task `verify` is empty or chains commands (`&&`, `;`, `|`).
- Reject if any `depends_on` ID cannot be found in `specs/` or `specs/archive/`.
- Reject if task acceptance checklist exceeds `limits.maxAcceptanceLines` (default: 7).
- Reject if `## Delta` is empty while `features.writes` contains entries.
- Warn if task title contains `" and "`.

## Folder Hashing

Before any task execution, the change folder is sealed:
- All files in the change folder are recursively collected, excluding `.run/`, `.git/`, and `.DS_Store`.
- Relative file paths are sorted lexicographically for deterministic ordering across platforms.
- File contents are normalized from CRLF to LF.
- A SHA-256 digest prefixed with `sha256:` is computed.

## Approval (`osq approve <ids...>`)

Running `osq approve <id>`:
- Resolves the change folder by 3-digit padded number or prefix.
- Runs the linter against the folder and halts on any errors.
- Computes the deterministic folder hash.
- Writes the hash to `.run/approved`.
- Re-approving after fixing a dead task updates `.run/approved` with the new folder hash.
