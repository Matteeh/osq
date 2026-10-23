## MODIFIED Requirements

### Requirement: Doctor decisions
`doctor` SHALL print a `decisions` line, as TypeScript's `checkDecisions`
builds it, when the project has decisions. It reads the ADRs with
rust-specs `read_decisions(root, "decisions", "openspec")`. The project
has decisions when that read finds an ADR or an ignored file, or when
`AGENTS.md` holds `<!-- OSQ:RULES:START -->`. Otherwise `doctor` prints no
`decisions` line. A missing `AGENTS.md` reads as the empty text.

The errors, in this order, are:

1. The errors of rust-specs `validate_decisions`, each displayed as `<file>: <message>`. Its living capabilities are the names of the folders directly under `openspec/specs` that hold a `spec.md`, in byte order. Its maximum rule length is `limits.maxRuleLength`.
2. `<adr path>: check file <file> does not exist` for each `checks` entry of each accepted ADR, in ADR order, when nothing exists at that path under the root.
3. The project rules errors: those of rust-specs `project_rules_errors` with
   the ADRs read, the text of `AGENTS.md` and `limits.maxProjectRules`.

The system-wide ADRs are the accepted ADRs whose `governs` is `all`, in
ADR order.

With any error the line is `[fail] decisions: <errors joined by "; ">`.
Otherwise the warnings are those of `validate_decisions`, displayed the
same way. When there is no system-wide ADR, they end with
`no accepted ADR applies to all; write the architecture and style ADRs first`.
With any warning the line is `[warn] decisions: <warnings joined by "; ">`.
Otherwise it is `[ok] decisions: <the number of ADRs> ADRs valid`.

#### Scenario: Doctor decisions lines
- **WHEN** `doctor` runs with no arguments on a new scratch root holding the row's `osq.toml` and the row's files. `<keep>` stands for `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\n---\n# 001. Keep\n`. `<rules>` stands for `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->`. `<all>` stands for `no accepted ADR applies to all; write the architecture and style ADRs first`
- **THEN** among the lines `doctor` returns, as its output or its failure message, the one that starts with a status and `decisions:` is the row's line, or no line is when the row says none:

| osq.toml | Files | Line |
|---|---|---|
| none | `AGENTS.md` `# Agents\n` | none |
| none | `decisions/001-keep.md` `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\nchecks: [checks/keep.rs]\n---\n# 001. Keep\n`, `checks/keep.rs` `x`, `AGENTS.md` `<rules>\n` | `[ok] decisions: 1 ADRs valid` |
| none | `openspec/specs/alpha/spec.md` `x`, `decisions/001-alpha.md` `---\nstatus: accepted\napplies_to: [alpha]\nrule: Alpha only.\n---\n# 001. Alpha\n` | `[warn] decisions: <all>` |
| none | `decisions/001-ghost.md` `---\nstatus: proposed\napplies_to: [ghost]\n---\n# 001. Ghost\n`, `decisions/draft.md` `# Draft\n` | `[warn] decisions: decisions/001-ghost.md: applies_to capability "ghost" has no living spec; decisions/draft.md: no osq frontmatter, ignored; <all>` |
| none | `decisions/notes.md` `# Notes\n` | `[warn] decisions: decisions/notes.md: no osq frontmatter, ignored; <all>` |
| none | `AGENTS.md` `<!-- OSQ:RULES:START -->\n` | `[warn] decisions: <all>` |
| none | `decisions/001-keep.md` `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\nchecks: [checks/missing.rs]\n---\n# 001. Keep\n`, `decisions/002-later.md` `---\nstatus: proposed\napplies_to: all\nchecks: [checks/gone.rs]\n---\n# 002. Later\n`, `AGENTS.md` `# Agents\n` | `` [fail] decisions: decisions/001-keep.md: check file checks/missing.rs does not exist; AGENTS.md is missing its project rules block; run `osq init` `` |
| none | `decisions/001-odd.md` `---\nstatus: done\n---\n# 001. Odd\n`, `AGENTS.md` `<rules>\n` | `` [fail] decisions: decisions/001-odd.md: status must be proposed, accepted, or superseded; AGENTS.md has an unexpected project rules block; run `osq init` `` |
| none | `decisions/001-keep.md` `<keep>`, `AGENTS.md` `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it now. ADR 001\n<!-- OSQ:RULES:END -->\n` | `` [fail] decisions: AGENTS.md project rules block is out of date; run `osq init` `` |
| none | `decisions/001-keep.md` `<keep>`, `AGENTS.md` `<!-- OSQ:RULES:END -->\n<!-- OSQ:RULES:START -->\n` | `` [fail] decisions: AGENTS.md is missing its project rules block; run `osq init` `` |
| `[limits]\nmaxRuleLength = 5\nmaxProjectRules = 1` | `decisions/001-keep.md` `<keep>`, `decisions/002-also.md` `---\nstatus: accepted\napplies_to: all\nrule: Also.\n---\n# 002. Also\n`, `AGENTS.md` `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n- Also. ADR 002\n<!-- OSQ:RULES:END -->\n` | `[fail] decisions: decisions/001-keep.md: rule is longer than limits.maxRuleLength (5); AGENTS.md holds 2 project rules, more than limits.maxProjectRules (1)` |
