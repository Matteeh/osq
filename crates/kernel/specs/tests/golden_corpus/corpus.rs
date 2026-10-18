//! Reading the live archive and living specs for the corpus golden tests.

mod archive;
mod living;
mod scan;

pub use archive::archive_failures;
pub use living::living_failures;

use std::path::{Path, PathBuf};

/// The repository root, three folders above this crate's manifest.
#[must_use]
pub fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/specs")
        .to_path_buf()
}
