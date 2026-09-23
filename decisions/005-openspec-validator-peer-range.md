# 005. OpenSpec Validator Peer Range

Date: 2026-09-23

## Status

Accepted

## Context

ADR 004 pinned `@fission-ai/openspec` to the exact version `1.13.1` in
`devDependencies` and declared a compatible range of `>=1.13.1 <2` in
`peerDependencies`. It also made any version that differed from the pin a hard
failure in `osq doctor`, `osq lint`, and `osq approve`.

That made the failure follow the installed version rather than the declared
contract. OpenSpec's own install guidance tracks `@latest`, so a consumer or
contributor who follows it and installs, say, `1.14.0` is inside the range osq
itself advertises yet is locked out of every gate. A version inside the declared
peer range is, by definition, one osq expects to interoperate with; refusing to
run the validator on it turns a compatibility promise into a version check.

## Decision

1. The exact `devDependencies` pin and the validator execution flags of ADR 004
   still stand: osq's own development and CI run the pinned `1.13.1` binary at
   `node_modules/.bin/openspec` with `OPENSPEC_TELEMETRY=0`, `--strict`,
   `--json`, and `--no-interactive`. This decision supersedes only ADR 004's
   version-drift failure rule for doctor, lint, and approve.
2. The installed version is classified against the `@fission-ai/openspec` range
   read from the `peerDependencies` entry in osq's own `package.json`:
   - A version equal to the pinned `1.13.1` passes unchanged.
   - A different version inside the declared peer range passes with a warning.
   - A version outside the range fails.
3. The warning is not a failure. In `osq doctor` the validator check passes with
   a warning flag, prints
   `[warn] validator: openspec version <v> differs from pinned 1.13.1; inside supported range >=1.13.1 <2 (ADR 005)`
   and exits 0. The healthy pin still prints `[ok] validator: pinned 1.13.1`.
   Outside the range doctor keeps the established failure
   `[fail] validator: openspec version <x> differs from pinned 1.13.1` and exits
   1. `osq lint` and `osq approve` emit the same warning text (without the
   `[warn] validator:` prefix) and pass.
4. The range grammar is a whitespace-separated list of comparators drawn from
   `>=`, `>`, `<=`, `<`, and `=` applied to numeric versions; every comparator
   must hold. An unreadable range, an unparseable version, or a prerelease is
   treated as outside the range so the gates fail closed.
5. The scheduled `OpenSpec latest` workflow keeps running the differential test
   against `@fission-ai/openspec@latest`. A failure means osq and upstream
   diverge; moving the pin or the range is a deliberate decision that requires
   its own ADR.
6. Archive folders keep osq's `<id>-<slug>` naming and are not renamed to
   OpenSpec's `<date>-<id>-<slug>` form. The differential test compares living
   specs only.

## Consequences

- Contributors and consumers who install a compatible OpenSpec release inside
  the declared range can use every gate, with an explicit warning naming the
  version and the range.
- The pin remains the reproducible profile for osq's own development and CI,
  and the peer range is now the contract the gates enforce.
- A genuinely incompatible validator still fails closed, citing ADR 004 and the
  install command `pnpm add -D @fission-ai/openspec@1.13.1`.
- Upstream drift is surfaced by the scheduled workflow rather than by an
  unexpected hard failure on a compatible version.
