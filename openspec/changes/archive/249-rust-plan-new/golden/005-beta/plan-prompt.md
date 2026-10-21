# Planning in the fixture

Write the change folder, then lint it.

# Change: 005 - Beta builds on alpha
Change ID: 005
Change Folder: 005-beta
Landed dependencies:
- openspec/changes/archive/001-alpha

## Capability Specs

All living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.

- openspec/specs/alpha/spec.md
- openspec/specs/beta/spec.md

## Architecture Decisions

Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.

- ADR 001: First rule. Applies to: all. Rule: Every fixture change follows the first rule. Path: decisions/001-first-rule.md
- ADR 002: Grouped rule. Applies to: alpha, group:fixture. Rule: Grouped capabilities share the second rule. Path: decisions/002-grouped-rule.md

## Brief

---
queue_item: beta
queue_hash: sha256:df66558c8d77256f97af512f9ec6ccff762a67369172c7e20611fe4111d39d48
planner: null
date: 2026-10-21
---

### Goal

Beta is the next item to plan.

### Requirements

- Beta keeps every line of its brief, word for word.