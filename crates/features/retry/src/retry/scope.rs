//! The scope hash retry recertifies through, now owned by the storage kernel.

use std::path::Path;

pub(crate) use osq_kernel_storage::ScopeHash;

/// Resolves and hashes a task's scope with rust-storage `task_scope_hash`.
///
/// Implements: rust-retry/recertified-done-marker
pub(crate) fn compute_hash(project: &Path, scope: &[String]) -> ScopeHash {
    osq_kernel_storage::task_scope_hash(project, scope)
}
