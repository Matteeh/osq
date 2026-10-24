//! The frontmatter writer retry recertifies through, now owned by storage.

use yaml_rust2::yaml::Hash;

/// Writes a mapping with rust-storage's frontmatter writer.
///
/// Implements: rust-retry/recertified-done-marker
pub(crate) fn write(mapping: &Hash) -> String {
    osq_kernel_storage::scope::write_frontmatter(mapping)
}
