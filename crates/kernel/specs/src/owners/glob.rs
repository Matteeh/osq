//! Scope globs, delegating to core's one matcher (ADR 026).

/// True when a list of scope entries covers one project-relative path.
///
/// Implements: rust-specs/scope-globs
#[must_use]
pub fn scope_covers_path(scope: &[String], path: &str) -> bool {
    osq_core::scope_covers_path(scope, path)
}
