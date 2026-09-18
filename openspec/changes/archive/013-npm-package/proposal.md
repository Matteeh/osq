---
title: NPM package distribution and automated release
depends_on:
  - 12
features:
  reads:
    - cli-foundation
---
## Goal

Make `osq` globally installable via `npm i -g osq` and executable via `npx osq`, establish an automated tag-driven GitHub Actions release pipeline publishing with npm Trusted Publishing (OIDC) under a personal npm account, and ensure strict package hygiene.

1. Configure `package.json` package metadata (`keywords`, `packageManager`, `sideEffects: false`, and an agnostic `prepublishOnly` build command), restricting packed tarball contents strictly to `dist/`, `templates/`, `README.md`, `LICENSE`, and `package.json`.
2. Ensure the built executable `dist/cli/bin.js` preserves its `#!/usr/bin/env node` shebang, dynamically resolves and prints the package version at runtime from `package.json` instead of a hardcoded string, and generates valid type declarations at `dist/index.d.ts`.
3. Introduce an end-to-end consumer project installation smoke test that packs a local tarball, installs it into an isolated temporary project, and verifies `npx osq init` and `npx osq new smoke` functionality, with an `OSQ_SKIP_PACK_TEST` bypass for fast local verification.
4. Implement `.github/workflows/release.yml` triggered by `v*` tag pushes that runs `pnpm verify` and the pack smoke test, validates git tag version parity against `package.json`, and publishes to npm using Trusted Publishing (`id-token: write`, `--provenance`, `--access public`) without storing static tokens or `.npmrc` authentication files.
5. Create `CHANGELOG.md` with an initial `0.1.0` entry summarising specs 001 through 012 and document the version bump and release workflow in `README.md`.

## Invariant

1. Account ownership rule: The package name is `osq`, unscoped. If claimed prior to release, it falls back to `@<personal-npm-username>/osq`. It must never use an organisation scope, organisation name in `name` or `publishConfig`, or organisation-owned trusted publisher.
2. Zero static publishing secrets: Publishing relies exclusively on npm Trusted Publishing via GitHub Actions OIDC (`permissions: id-token: write`). No `NPM_TOKEN` secrets or `.npmrc` files with authentication may exist in the repository.
3. Lockfile integrity: `pnpm-lock.yaml` is the sole lockfile of record. No `package-lock.json` is committed, and CI installs with `pnpm install --frozen-lockfile`.
4. Runtime independence: `prepublishOnly` must not depend on `pnpm` being on `PATH`, enabling `npm publish` to build cleanly in any standard environment.

## Human steps

Manual configuration required on `npmjs.com` prior to triggering the automated release workflow:

1. **Personal Account Verification**:
   - Sign in to `npmjs.com` under your personal account.
   - Confirm active session is your personal account (not switched into an organisation context).

2. **Name Availability & Fallback**:
   - Verify availability of the unscoped package name `osq` (`npm view osq` currently 404s).
   - If `osq` remains unclaimed, proceed with the unscoped name `osq`.
   - If `osq` has been claimed by a third party, update `package.json` to `@<my-personal-npm-username>/osq` under your personal user namespace (never an organisation namespace).

3. **Configure npm Trusted Publisher (OIDC)**:
   - On `npmjs.com`, navigate to **Account Settings** -> **Publishing Access** (or package settings if already initialized).
   - Add a new **GitHub Actions** Trusted Publisher with:
     - **GitHub Organization or User**: Repository owner (`Matteeh`)
     - **Repository name**: `osq`
     - **Workflow filename**: `release.yml`
     - **Environment**: (leave empty unless a GitHub environment is configured)
   - Confirm the trusted publisher is registered under your personal user account.

4. **Security & Permissions**:
   - Verify that 2FA is active on the personal npm account.
   - Do NOT create or add any `NPM_TOKEN` secrets or `.npmrc` authentication tokens to GitHub repository secrets or project files.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Package tarball (`npm pack`) | Archive contains strictly `dist/`, `templates/`, `README.md`, `LICENSE`, `package.json`; metadata includes `keywords`, `packageManager`, `sideEffects: false`; `prepublishOnly` invokes build without requiring pnpm on PATH |
| CLI executable & API types | `dist/cli/bin.js` retains `#!/usr/bin/env node` shebang; `osq --version` dynamically reads `version` from `package.json` at runtime; `dist/index.d.ts` exposes programmatic exports |
| Consumer installation smoke test | Installing packed `.tgz` in clean temporary directory succeeds; `npx osq init` and `npx osq new <name>` create valid project files; skipped when `OSQ_SKIP_PACK_TEST` is set |
| Tag push release workflow (`.github/workflows/release.yml`) | Triggered on `v*` tag push; verifies tag matches `package.json` version; runs `pnpm verify` and pack smoke test; publishes with `npm publish --provenance --access public` via `id-token: write` OIDC without secrets |
| Release history & documentation | `CHANGELOG.md` created with `0.1.0` entry summarising specs 001 through 012; `README.md` documents concise version bump and release procedure |

## Non-goals

- Adding external bundling tools, minifiers, or multi-target transpilers (Rollup, esbuild, Webpack).
- Publishing packages under an organisation scope or setting up team permissions.
- Automating git tag creation or changelog generation through automated bot commits.
- Supporting legacy CommonJS module loading (`require`).

## Delta (legacy)

### `features/cli-foundation.md`

## Distribution & Release Management

`osq` is distributed as a public, standalone npm package installable globally via `npm i -g osq` or runnable on-demand via `npx osq`:

- **Package Artifact Hygiene**: The published tarball contains exclusively compiled output (`dist/`), starter templates (`templates/`), and essential legal and usage documentation (`README.md`, `LICENSE`, `package.json`). Package manifests declare `keywords`, `packageManager`, and `sideEffects: false`, while build scripts run standard compiler invocations (`npm run build`) decoupled from specific package manager binaries on `PATH`.
- **Runtime Executable & API Types**: The primary binary entrypoint (`dist/cli/bin.js`) preserves executable shebangs across compilation steps and resolves version identifiers dynamically from `package.json` at runtime, ensuring parity with release metadata. Programmatic TypeScript consumers receive full declaration typings through `dist/index.d.ts`.
- **Automated OIDC Release Pipeline**: Production releases are triggered by pushing semver git tags matching `v*` to the repository. The release workflow (`.github/workflows/release.yml`) executes frozen-lockfile validation, verification test suites, and fresh consumer installation smoke tests before publishing with `npm publish --provenance --access public`. Authentication is negotiated strictly through npm Trusted Publishing using OpenID Connect (OIDC) tokens, eliminating persistent credential secrets.
- **Version Tracking & Release Procedure**: Every published release corresponds to a documented entry in `CHANGELOG.md`. Release engineers update package version metadata, append release notes, commit changes, tag the commit with the matching `v<version>`, and push tags to main to initiate automated distribution.