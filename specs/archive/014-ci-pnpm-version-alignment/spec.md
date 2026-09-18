---
title: Align CI and release workflows with packageManager
depends_on: [013]
features:
  reads: [cli-foundation]
  writes: [cli-foundation]
---
## Goal

Fix GitHub Actions workflow failures caused by conflicting pnpm version declarations between `pnpm/action-setup@v4` and `package.json`.

1. In `.github/workflows/ci.yml` and `.github/workflows/release.yml`, remove `with: version: 9` from `pnpm/action-setup@v4` steps so that the action automatically derives the exact pnpm version from `"packageManager": "pnpm@9.15.4"` in `package.json`.
2. Update `tests/release-workflow.test.ts` to assert that `pnpm/action-setup` does not declare a conflicting `version` property when `package.json` pins `packageManager`, and assert that both CI and release workflows adhere to this rule.
3. Update `features/cli-foundation.md` to document that CI and release workflows delegate pnpm version resolution to `packageManager` in `package.json`.

## Contract

| Workflow / Config | Expected Behavior |
|---|---|
| `pnpm/action-setup@v4` in `.github/workflows/*.yml` | Uses `pnpm/action-setup@v4` without `with.version`; automatically resolves and installs the version declared in `package.json` (`packageManager: pnpm@9.15.4`) without `ERR_PNPM_BAD_PM_VERSION` errors |

## Non-goals

- Upgrading pnpm to a new major version or removing `"packageManager"` from `package.json`.
- Modifying Node version matrices or runner operating systems.
- Modifying `osq` CLI or watcher runtime dependencies.

## Delta

Update `features/cli-foundation.md` under `## Distribution & Release Management` to document that CI and release workflows delegate pnpm setup directly to `packageManager` in `package.json`:

- **Automated OIDC Release Pipeline**: Production releases are triggered by pushing semver git tags matching `v*` to the repository. The release workflow (`.github/workflows/release.yml`) executes frozen-lockfile validation, verification test suites, and fresh consumer installation smoke tests before publishing with `npm publish --provenance --access public`. Package manager setup delegates directly to `package.json` (`packageManager`), eliminating version mismatch errors (`ERR_PNPM_BAD_PM_VERSION`) and preserving version parity between local development and CI runners. Authentication is negotiated strictly through npm Trusted Publishing using OpenID Connect (OIDC) tokens, eliminating persistent credential secrets.
