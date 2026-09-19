---
title: "016 completion: pinned validator enforcement, spec re-seed, prose appender deletion, writes schema removal, and OpenSpec doc alignment"
depends_on: ['027']
verify: "node_modules/.bin/openspec validate --specs --strict && node --import tsx --test tests/validator-missing.test.ts && ! git grep -q 'Delta from' openspec/specs/ && pnpm verify"
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - status-inspection
    - metrics-and-reporting
---
## Goal

Complete all commitments originally promised in Change 016's proposal so they are strictly true of \main\:

1. **Pinned Validator Enforcement & Fail-Not-Skip**:
   - \osq lint\ and \osq approve\ fail immediately when the OpenSpec validator binary is missing or its version differs from pinned \1.13.1\.
   - The failure message explicitly names ADR 004 (\decisions/004-pinned-openspec-validator.md\) and specifies the installation command (\pnpm add -D @fission-ai/openspec@1.13.1\).
   - The word "skipped" does not appear in \osq\ output for any check anywhere; an automated test enforces the case-insensitive absence of the word "skipped" across all source files under \src/\.

2. **Living Spec Re-seed & Prose Appender Deletion**:
   - Re-seed all five living capability specs in \openspec/specs/\ by executing the deterministic delta merge over 016's archived delta specifications, in archive sequence (016 through 027), into \openspec/specs/\.
   - Delete the legacy prose appender function \pplyDelta\ in \src/watcher/archiver.ts\ so its identifier does not exist in source code or exports. \rchiveSpecFolder\ invokes \pplyOpenSpecDeltas\ directly.
   - Remove legacy \openspec/specs/*.md\ files and strip all "## Delta from ..." paragraphs from living specifications.
   - An automated test proves that living specs equal the deterministic merge of all archived deltas from 016 onward, preserving all requirements introduced by changes 017 through 027.

3. **Removal of \eatures.writes\ from Proposal Schema**:
   - Remove \eatures.writes\ from the proposal schema and parser. The set of delta spec files under \specs/<capability>/spec.md\ in a change folder is the sole authoritative declaration of capability writes.
   - \osq lint\ rejects any proposal containing \eatures.writes\.
   - \osq migrate openspec\ normalizes post-016 archives (stripping \eatures.writes\, deleting redundant root \spec.md\ in 017) as an idempotent migration pass.

4. **Retirement of Legacy \specs/\ Scaffolding**:
   - Delete \specs/_template/\.
   - Remove legacy \specs/\ scaffolding directories and template file creation from \src/core/init.ts\. \osq init\ scaffolds \openspec/\ only.

5. **OpenSpec Layout Documentation and Managed Block Rewrite**:
   - Rewrite \README.md\ and the managed \AGENTS.md\ block (\MANAGED_AGENTS_MD_BODY\ in \src/core/init.ts\) to describe the OpenSpec layout: change folder structure, \.run/\ markers including \egressed\, the two gates (approval and verification), state derivation from disk, and executor permissions.
   - The managed block completely eliminates all references to \eatures/\, \specs/\, or "drift against features".
   - Automated tests assert that the managed block contains none of the retired paths and that \osq setup\ leaves OpenSpec's own managed block untouched.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Validator missing or drifted | \osq lint\ and \osq approve\ fail with exit 1; error message cites ADR 004 and \pnpm add -D @fission-ai/openspec@1.13.1\; zero checks report "skipped" |
| Grep check on \src/\ | Automated test asserts \grep -ri "skipped" src/\ returns zero matches |
| Archiver delta merge | \rchiveSpecFolder\ merges deltas directly via \pplyOpenSpecDeltas\; identifier \pplyDelta\ is completely absent from \src/\ |
| Living specs check | \openspec/specs/\ equals the cumulative deterministic merge of all archived delta files from 016 onward; \git grep "Delta from" openspec/specs/\ returns zero matches; \openspec validate --specs --strict\ passes |
| Proposal linting | \osq lint\ rejects proposals that declare \eatures.writes\; capability writes are derived strictly from files present in \specs/\ |
| Archive migration | \osq migrate openspec\ strips \eatures.writes\ from post-016 proposal frontmatter and removes redundant \spec.md\ files idempotently |
| Project initialization | \osq init\ creates only \openspec/\ directories and config files; does not create \specs/\ or \specs/_template/\ |
| Managed instructions block | \AGENTS.md\ and \MANAGED_AGENTS_MD_BODY\ contain zero mentions of \eatures/\, \specs/\, or \drift against features\; \osq setup\ preserves existing OpenSpec blocks |

## Non-goals

- Altering the deterministic delta merge algorithm or AST grammar in \src/core/delta.ts\.
- Floating the OpenSpec validator dependency beyond exact \1.13.1\.
- Deleting historical change folders under \specs/archive/\.
- Permitting any "skipped" status or log message across CLI commands.

## Human steps

Run the following command from the repository root to install the pinned OpenSpec validator as mandated by ADR 004:
\\\ash
pnpm add -D @fission-ai/openspec@1.13.1
\\\
Ensure \package.json\ contains \"@fission-ai/openspec": "1.13.1"\ under \devDependencies\ and \"@fission-ai/openspec": ">=1.13.1 <2"\ under \peerDependencies\.

## Delta

This change enforces pinned validator execution in \spec-lint-and-approve\, eliminates \eatures.writes\ from proposal requirements, deletes the prose appender in \watcher-and-harness\, re-seeds living specifications under \openspec/specs/\, and aligns initialization and documentation in \cli-foundation\.