# Spec Delta: rust-vcs

## Purpose
The vcs kernel is osq's git port: it reads repositories and makes the commits osq alone writes, as ADR 003 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/vcs/** -->
The rust-vcs capability SHALL own the `osq-kernel-vcs` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Vcs crate ownership
- **WHEN** file ownership is resolved for the vcs kernel
- **THEN** system maps `crates/kernel/vcs/**` to rust-vcs
