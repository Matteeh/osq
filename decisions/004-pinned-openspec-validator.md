# 004. Pinned OpenSpec Validator

Date: 2026-09-19

## Status

Accepted

## Context

`AGENTS.md` mandates zero runtime dependencies beyond `chokidar`, `yaml`, `commander`, and `jiti`, requiring an ADR before adding or integrating external tooling. `osq` acts as a strict execution profile of OpenSpec and validates changes and living specs using OpenSpec's official validator CLI.

Relying on a floating version of the validator would make validation results non-reproducible: a new upstream release could change rule semantics, output shape, or exit codes without any change in this repository. The validator is therefore a pinned development/tooling dependency rather than a runtime dependency of the published package.

## Decision

1. Pin `@fission-ai/openspec` to the exact version `1.13.1` in `devDependencies`, and declare a compatible range of `>=1.13.1 <2` in `peerDependencies`.
2. Invoke the local binary at `node_modules/.bin/openspec` rather than a globally resolved executable, with the environment `OPENSPEC_TELEMETRY=0` and the flags `--strict`, `--json`, and `--no-interactive`.
3. Validation execution semantics: every validation run sets `OPENSPEC_TELEMETRY=0`, passes `--strict` to escalate warnings, passes `--json` so output is machine-readable, and passes `--no-interactive` so the validator never prompts.
4. `osq doctor` probes the validator by running `openspec --version` and comparing the reported version against the pinned `1.13.1`.
   - On match, doctor outputs `[ok] validator: pinned 1.13.1`.
   - On version drift, doctor outputs `[fail] validator: openspec version <x> differs from pinned 1.13.1` and exits 1.
   - On a missing binary, doctor outputs `[fail] validator: binary unavailable: openspec` and exits 1.
5. Updating the pin is a deliberate change governed by a superseding ADR; the pin is never floated implicitly.

## Consequences

- Validation is reproducible across machines and CI because the exact validator version is fixed.
- Version drift is surfaced explicitly by `osq doctor` instead of failing validation in a confusing way.
- Upgrading the validator requires a new ADR, keeping the project on the documented strict execution profile.
- The validator is never shipped as a runtime dependency of the published package.
