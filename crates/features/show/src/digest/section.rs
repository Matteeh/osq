//! The approval digest and flag lines of one change.

mod capability;
mod flags;
mod format;
mod model;
mod read;

use std::path::{Path, PathBuf};

use osq_kernel_storage::Location;

use crate::model::Change;

pub(crate) use flags::Flag;
pub(crate) use model::{Digest, DigestCapability, DigestDecision, DigestTask};

/// One change's digest and its flags.
pub(crate) struct Built {
    /// The digest itself.
    pub(crate) digest: Digest,
    /// The flags in TypeScript's fixed order.
    pub(crate) flags: Vec<Flag>,
}

/// The approval digest and `Flag:` lines, or none for an approved change.
pub(crate) fn lines(change: &Change) -> Vec<String> {
    let Some(built) = build(change) else {
        return vec![];
    };
    let mut lines = format::lines(&built.digest);
    lines.extend(built.flags.iter().map(Flag::line));
    lines
}

/// Builds the digest and its flags, or none for an approved change.
///
/// Implements: rust-show/show-json
pub(crate) fn build(change: &Change) -> Option<Built> {
    if change.approved_hash.is_some() {
        return None;
    }
    let root = project_root(change)?;
    let digest = read::digest(change, &root);
    let flags = flags::flags(change, &digest);
    Some(Built { digest, flags })
}

/// The project root above a change folder, three levels up when active and
/// four when archived or rejected.
fn project_root(change: &Change) -> Option<PathBuf> {
    let depth = if change.location == Location::Active {
        3
    } else {
        4
    };
    change.path.ancestors().nth(depth).map(Path::to_path_buf)
}
