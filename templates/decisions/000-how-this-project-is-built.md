---
status: proposed
applies_to: all
---

# 000. How this project is built

This is a starter ADR. It asks how this project is built. Answer the questions
in place, then turn each answer that is a rule into its own accepted ADR. osq
prescribes no answer here.

## Layering

Which layers exist, what may each layer import, and where does logic live?

## State

Where does state live, and who writes it?

## Errors

How are errors raised, reported, and recovered?

## Tests

What does a test look like, and what may it touch?

## Naming

How are files, modules, and functions named?

## Turning answers into ADRs

For each answer that is a rule, write an accepted ADR with `applies_to: all`, a
one-sentence `rule`, and a `checks` list naming a test wherever the rule can be
tested. Keep this file while its answers are still open, or delete it once they
live in their own accepted ADRs.
