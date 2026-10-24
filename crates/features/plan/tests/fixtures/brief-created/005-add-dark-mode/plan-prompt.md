# Planning in the fixture

Write the change folder, then lint it.

# Change: 005 - Add dark mode!
Change ID: 005
Change Folder: 005-add-dark-mode

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
owner: design team
date: 2026-10-24
planner: null
---

### Goal

Add a dark mode to the dashboard.

### Requirements

- The toggle remembers the choice.

## This repository's record

This repository's measured record is too small (fewer than 5 tasks).