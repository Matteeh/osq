# Architecture Decision Records (ADRs)

This directory records architectural decision records for `osq`.

Decisions are recorded as numbered markdown documents (e.g.,  `001-short-title.md`) following an immutable history: decisions are superseded rather than edited in place.

## Format

An ADR may begin with YAML frontmatter that osq reads:

```yaml
---
status: accepted
applies_to: [cli-foundation]
rule: Load osq.config.ts, .js and .mjs with jiti; add no other TypeScript loader.
checks:
  - tests/config.test.ts
denies:
  - ts-node
---
```

- `status` is one of `proposed`, `accepted`, or `superseded`. Only accepted ADRs take effect.
- `applies_to` is `all` or a list of capability names the decision governs.
- `rule` is one sentence saying what a spec must do.
- `superseded_by` names the number of the replacement ADR on a superseded ADR.
- `checks` is a list of repository-relative test files that enforce the decision.
- `denies` is a list of package names the decision forbids.

`osq doctor` fails when a check file named by an accepted ADR does not exist. Only
accepted ADRs' `checks` and `denies` take effect; a proposed or superseded ADR's
checks and denials are read but not enforced.

The number comes from the file name (`007-ui-framework.md` is ADR 007). A markdown file without frontmatter is ignored.

## Index

- [001. Use jiti for Runtime Config Loading](001-use-jiti-for-runtime-config-loading.md)
- [002. Feature Doc Delta Application Strategy](002-feature-doc-delta-application.md)
- [004. Pinned OpenSpec Validator](004-pinned-openspec-validator.md)
- [005. OpenSpec Validator Peer Range](005-openspec-validator-peer-range.md)
