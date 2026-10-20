//! Merging every delta spec of a change folder into the living specs (ADR 026).

use super::compose::merge_living_spec;
use super::error::MergeError;
use crate::markdown::parse_delta;
use crate::read::SpecsError;
use crate::validate::change::{folders, read_text};
use serde::Serialize;
use std::fmt;
use std::path::{Path, PathBuf};

/// One delta spec of a change and the living text it merges to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MergedSpec {
    /// The capability folder name the delta sits under.
    pub capability: String,
    /// The delta spec's joined path.
    pub delta: PathBuf,
    /// The merged living text, or none for a capability the change empties.
    pub text: Option<String>,
}

/// Why merging a change's delta specs failed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum MergeChangeError {
    /// A delta or living spec could not be read or is not UTF-8.
    Read(SpecsError),
    /// A delta could not be applied to its living spec.
    Merge {
        /// The delta spec's joined path.
        path: PathBuf,
        /// The refusal the delta makes.
        error: MergeError,
    },
}

impl fmt::Display for MergeChangeError {
    /// Writes the read error, or the path and the merge refusal.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read(error) => error.fmt(formatter),
            Self::Merge { path, error } => write!(formatter, "{}: {error}", path.display()),
        }
    }
}

impl std::error::Error for MergeChangeError {}

/// Merges each delta spec of a change folder into the living specs, writing nothing.
///
/// Reads the `spec.md` of each folder directly under `change_dir/specs`, folders
/// in byte order of their names, and merges it with `merge_living_spec` into the
/// living spec at `specs_dir/<folder>/spec.md`, or none when that is not a file.
/// Returns one `MergedSpec` per delta spec, in that order.
///
/// # Errors
///
/// Returns `MergeChangeError::Read` when a delta or living spec cannot be read
/// or is not UTF-8, and `MergeChangeError::Merge` for the first delta that
/// cannot be applied.
///
/// Implements: rust-specs/change-merge
pub fn merge_change(
    change_dir: &Path,
    specs_dir: &Path,
) -> Result<Vec<MergedSpec>, MergeChangeError> {
    let mut merged = Vec::new();
    for folder in folders(&change_dir.join("specs")) {
        let delta_path = folder.join("spec.md");
        if !delta_path.is_file() {
            continue;
        }
        let Some(capability) = folder
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
        else {
            continue;
        };
        let delta_text = read_text(&delta_path).map_err(MergeChangeError::Read)?;
        let delta = parse_delta(&delta_text);
        let living = living_text(specs_dir, &capability)?;
        let text = merge_living_spec(living.as_deref(), &capability, &delta).map_err(|error| {
            MergeChangeError::Merge {
                path: delta_path.clone(),
                error,
            }
        })?;

        merged.push(MergedSpec {
            capability,
            delta: delta_path,
            text,
        });
    }
    Ok(merged)
}

/// Reads the living spec of one capability, or none when it has no `spec.md`.
fn living_text(specs_dir: &Path, capability: &str) -> Result<Option<String>, MergeChangeError> {
    let path = specs_dir.join(capability).join("spec.md");
    if !path.is_file() {
        return Ok(None);
    }
    read_text(&path).map(Some).map_err(MergeChangeError::Read)
}
