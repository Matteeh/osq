# CLI Foundation

Describes the foundational command-line interface, configuration system, and project scaffolding in `osq`.

## Configuration

`osq` loads its operational configuration from `osq.config.ts` located at the root of the project. Configuration is typed by `OsqConfig` and declared using the `defineConfig` helper:

- Limits:
  - `maxScopeFiles`: Maximum number of files matched by a task's scope glob (default: 8).
  - `maxFeatureWrites`: Maximum entries in `features.writes` (default: 2).
  - `maxContractTables`: Maximum markdown tables allowed under `## Contract` (default: 1).
  - `maxAcceptanceLines`: Maximum lines permitted in task acceptance checklist (default: 7).
- Paths:
  - `specs`: Root folder for change specifications (default: `specs`).
  - `archive`: Folder for completed change specifications (default: `specs/archive`).
  - `features`: Living documentation describing current behavior of main (default: `features`).
  - `decisions`: Architectural decision records (default: `decisions`).
- Timeouts:
  - `staleLockSeconds`: Maximum age for task locks before reaping (default: 300).
  - `taskTimeoutSeconds`: Maximum duration allowed for a single agent execution (default: 1800).
- Harness:
  - Adapter used for spawning coding agents (default: `agy` or `OSQ_HARNESS` environment variable).

## Scaffolding (`osq init`)

Running `osq init` sets up the folder structure and initial templates in any project:
- Creates `specs/`, `specs/_template/`, `specs/archive/`, `features/`, and `decisions/`.
- Places default `osq.config.ts` and `.env.example` if they do not already exist.
- Places `spec.md`, `tasks.md`, and `tasks/1.md` templates under `specs/_template/`.
- Injects or refreshes the managed agent procedure block in `AGENTS.md` between `<!-- OSQ:START -->` and `<!-- OSQ:END -->`. Existing content outside the markers is preserved.
- `init` is strictly idempotent and safe to run on existing repositories.

## Change Creation (`osq new <name>`)

Running `osq new <name>` prepares a new change specification:
- Scans `specs/` to find the highest numbered prefix and generates the next 3-digit padded number (e.g. `001` -> `002`).
- Kebab-cases the name into a clean directory slug.
- Recursively copies `specs/_template/` into `specs/<id>-<slug>/`.
- Updates `spec.md` with the supplied human-readable title.
