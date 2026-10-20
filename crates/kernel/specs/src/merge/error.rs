//! The refusal a delta merge makes, with TypeScript's `DeltaMergeError` texts.

use crate::markdown::RenameSide;
use serde::Serialize;
use std::fmt;

/// Why a delta cannot be merged into a base spec.
///
/// Carries the capability merged and, except for a malformed rename, the
/// requirement name the refusal names. Its `Display` writes the message
/// TypeScript's `DeltaMergeError` writes for the same refusal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum MergeError {
    /// A rename entry is not in the expected form.
    InvalidRename {
        /// The capability merged.
        capability: String,
        /// The malformed rename line, trimmed.
        line: String,
    },
    /// A rename side has no partner.
    UnpairedRename {
        /// The capability merged.
        capability: String,
        /// Whether the FROM or the TO side is unpaired.
        side: RenameSide,
        /// The name of the unpaired side.
        requirement: String,
    },
    /// An ADDED name an earlier ADDED block also has.
    DuplicateAdded {
        /// The capability merged.
        capability: String,
        /// The duplicated requirement name.
        requirement: String,
    },
    /// A MODIFIED name the spec has no block for.
    ModifiedMissing {
        /// The capability merged.
        capability: String,
        /// The missing requirement name.
        requirement: String,
    },
    /// A rename against no base.
    RenameWithoutBase {
        /// The capability merged.
        capability: String,
        /// The FROM name of the first rename.
        requirement: String,
    },
    /// A rename whose FROM name the spec has no block for.
    RenameSourceMissing {
        /// The capability merged.
        capability: String,
        /// The FROM name of the rename.
        requirement: String,
    },
    /// A rename whose TO name the spec already has.
    RenameTargetExists {
        /// The capability merged.
        capability: String,
        /// The TO name of the rename.
        requirement: String,
    },
    /// A REMOVED name the spec has no block for.
    RemovedMissing {
        /// The capability merged.
        capability: String,
        /// The missing requirement name.
        requirement: String,
    },
    /// A MODIFIED block dropping scenarios the current block has.
    ScenariosDropped {
        /// The capability merged.
        capability: String,
        /// The modified requirement name.
        requirement: String,
        /// The dropped scenario names, in the current block's order.
        scenarios: Vec<String>,
    },
    /// An ADDED name the spec has with different content.
    AddedExists {
        /// The capability merged.
        capability: String,
        /// The existing requirement name.
        requirement: String,
    },
    /// An ADDED name differing only in case or spacing from an existing one.
    AddedNearMiss {
        /// The capability merged.
        capability: String,
        /// The added requirement name.
        requirement: String,
    },
}

impl MergeError {
    /// The capability merged.
    ///
    /// Implements: rust-specs/merge-refusals
    #[must_use]
    pub fn capability(&self) -> &str {
        match self {
            Self::InvalidRename { capability, .. }
            | Self::UnpairedRename { capability, .. }
            | Self::DuplicateAdded { capability, .. }
            | Self::ModifiedMissing { capability, .. }
            | Self::RenameWithoutBase { capability, .. }
            | Self::RenameSourceMissing { capability, .. }
            | Self::RenameTargetExists { capability, .. }
            | Self::RemovedMissing { capability, .. }
            | Self::ScenariosDropped { capability, .. }
            | Self::AddedExists { capability, .. }
            | Self::AddedNearMiss { capability, .. } => capability,
        }
    }

    /// The requirement name the refusal names, or none for a malformed rename.
    ///
    /// Implements: rust-specs/merge-refusals
    #[must_use]
    pub fn requirement(&self) -> Option<&str> {
        match self {
            Self::InvalidRename { .. } => None,
            Self::UnpairedRename { requirement, .. }
            | Self::DuplicateAdded { requirement, .. }
            | Self::ModifiedMissing { requirement, .. }
            | Self::RenameWithoutBase { requirement, .. }
            | Self::RenameSourceMissing { requirement, .. }
            | Self::RenameTargetExists { requirement, .. }
            | Self::RemovedMissing { requirement, .. }
            | Self::ScenariosDropped { requirement, .. }
            | Self::AddedExists { requirement, .. }
            | Self::AddedNearMiss { requirement, .. } => Some(requirement),
        }
    }

    /// The message TypeScript's `DeltaMergeError` writes for this refusal.
    fn message(&self) -> String {
        match self {
            Self::InvalidRename { capability, line } => format!(
                "{capability} RENAMED failed - entry \"{line}\" is not in the expected form. \
                 Write each rename as \"- FROM: `### Requirement: X`\" followed by \
                 \"- TO: `### Requirement: Y`\"."
            ),
            Self::UnpairedRename {
                capability,
                side,
                requirement,
            } => {
                let missing = match side {
                    RenameSide::From => "TO",
                    RenameSide::To => "FROM",
                };
                header_failure(
                    capability,
                    "RENAMED",
                    requirement,
                    &format!("no matching {missing}"),
                )
            }
            Self::DuplicateAdded {
                capability,
                requirement,
            } => header_failure(
                capability,
                "ADDED",
                requirement,
                "duplicate requirement in ADDED",
            ),
            Self::ModifiedMissing { requirement, .. } => apply_failure("MODIFIED", requirement),
            Self::RenameWithoutBase { requirement, .. } => apply_failure("RENAMED", requirement),
            Self::RenameSourceMissing {
                capability,
                requirement,
            } => header_failure(capability, "RENAMED", requirement, "source not found"),
            Self::RenameTargetExists {
                capability,
                requirement,
            } => header_failure(capability, "RENAMED", requirement, "target already exists"),
            Self::RemovedMissing { requirement, .. } => apply_failure("REMOVED", requirement),
            Self::ScenariosDropped {
                capability,
                requirement,
                scenarios,
            } => {
                let names = scenarios
                    .iter()
                    .map(|name| format!("\"{name}\""))
                    .collect::<Vec<String>>()
                    .join(", ");
                header_failure(
                    capability,
                    "MODIFIED",
                    requirement,
                    &format!(
                        "current spec contains scenario(s) not present in the modified block: \
                         {names}. Refresh the change spec before archiving to avoid dropping \
                         scenarios."
                    ),
                )
            }
            Self::AddedExists {
                capability,
                requirement,
            } => header_failure(capability, "ADDED", requirement, "already exists"),
            Self::AddedNearMiss {
                capability,
                requirement,
            } => header_failure(
                capability,
                "ADDED",
                requirement,
                "a requirement differing only in case or spacing already exists",
            ),
        }
    }
}

/// A `<capability> <op> failed for header "### Requirement: <name>" - <tail>`.
fn header_failure(capability: &str, operation: &str, requirement: &str, tail: &str) -> String {
    format!(
        "{capability} {operation} failed for header \"### Requirement: {requirement}\" - {tail}"
    )
}

/// A `Cannot apply <op>: requirement "<name>" not found in base spec`.
fn apply_failure(operation: &str, requirement: &str) -> String {
    format!("Cannot apply {operation}: requirement \"{requirement}\" not found in base spec")
}

impl fmt::Display for MergeError {
    /// Writes the message of the refusal, as TypeScript writes it.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message())
    }
}

impl std::error::Error for MergeError {}
