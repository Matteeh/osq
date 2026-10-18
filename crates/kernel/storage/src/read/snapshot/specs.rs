//! Reading a change's delta specs and its proposal's verify with the specs kernel.
//!
//! Storage parses no delta spec or proposal frontmatter itself for these
//! fields; the specs kernel owns that (ADR 026).
//!
//! Implements: rust-storage/delta-capabilities
//! Implements: rust-storage/task-plans

use std::fs;
use std::path::Path;

use osq_kernel_specs::Delta;

use crate::read::StorageError;

/// One delta spec of a change: its capability folder and the specs kernel's parse.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CapabilityDelta {
    /// The folder directly under the change's `specs/`.
    pub capability: String,
    /// The delta parsed by the specs kernel.
    pub delta: Delta,
}

/// Reads every delta spec of a change, in folder name order by bytes.
///
/// A folder without `spec.md` is left out, and a change without `specs/` has
/// no deltas.
pub(super) fn read_deltas(folder: &Path) -> Result<Vec<CapabilityDelta>, StorageError> {
    let dir = folder.join("specs");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut folders: Vec<String> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    folders.sort();
    let mut deltas = Vec::new();
    for capability in folders {
        let spec = dir.join(&capability).join("spec.md");
        if !spec.is_file() {
            continue;
        }
        let delta = osq_kernel_specs::read_delta(&spec).map_err(StorageError::Specs)?;
        deltas.push(CapabilityDelta { capability, delta });
    }
    Ok(deltas)
}

/// Reads the proposal's verify, or empty text when the change has no proposal.
pub(super) fn read_verify(folder: &Path) -> Result<String, StorageError> {
    let path = folder.join("proposal.md");
    if !path.is_file() {
        return Ok(String::new());
    }
    let proposal = osq_kernel_specs::read_proposal(&path).map_err(StorageError::Specs)?;
    Ok(proposal.verify)
}
