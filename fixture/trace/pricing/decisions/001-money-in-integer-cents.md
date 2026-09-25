---
status: accepted
applies_to: [pricing]
rule: Every amount is an integer number of cents, and a quote rounds once, half up.
---
# 001. Money in Integer Cents

Date: 2026-09-20

## Status

Accepted

## Context

Floating-point dollars accumulate rounding error across a quote's steps.

## Decision

Every amount is an integer number of cents, and a quote rounds once, half up.

## Consequences

- One rounding step keeps quotes exact and reproducible.
- Every amount crosses a boundary as a whole number of cents.
