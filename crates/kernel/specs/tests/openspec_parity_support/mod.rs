//! Shared helpers for the specs kernel's `OpenSpec` CLI parity tests (ADR 026).
//!
//! The validate parity test and the archive parity test both build temporary
//! `OpenSpec` projects and run the CLI, so those helpers live here. An
//! integration test declares this folder as `pub mod openspec_parity_support;`
//! and uses the parts it needs; the rest stay reachable, so they do not warn as
//! dead code.

pub mod cli;
pub mod items;
pub mod project;
pub mod replay;
pub mod report;
pub mod trees;
