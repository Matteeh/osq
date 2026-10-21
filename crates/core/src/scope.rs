//! Scope coverage and the audit of a task's changed paths.
//!
//! Implements: rust-core/scope-coverage
//! Implements: rust-core/scope-audit

mod audit;
mod glob;

pub use audit::{
    ChangedPath, DisallowReason, Disallowed, LockRule, PathChange, ScopeAudit, audit_scope,
};
pub use glob::scope_covers_path;
