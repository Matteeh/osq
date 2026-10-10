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
- [003. Git strategy](003-git-strategy.md)
- [004. Pinned OpenSpec Validator](004-pinned-openspec-validator.md)
- [005. OpenSpec Validator Peer Range](005-openspec-validator-peer-range.md)
- [006. osq is the deterministic core](006-deterministic-core.md)
- [007. Role environments](007-role-environments.md)
- [008. SQLite read index](008-sqlite-read-index.md)
- [009. Loopback write actions](009-loopback-write-actions.md)
- [010. Validator role](010-validator-role.md)
- [011. Traceability trial](011-traceability-trial.md)
- [012. Watch service](012-watch-service.md)
- [013. Remote access](013-remote-access.md)
- [014. Server mode](014-server-mode.md)
- [015. MCP transport](015-mcp-transport.md)
- [016. Capability slices](016-capability-slices.md)
