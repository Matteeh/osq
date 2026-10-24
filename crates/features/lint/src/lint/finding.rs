//! A finding the proposal and banned word rules give, before `text` writes it.

use std::path::{Path, PathBuf};

use osq_core::Finding as LinkFinding;
use osq_kernel_specs::{MergeError, SpecFinding};

use super::text;

/// Whether a finding fails the change or only informs the reader.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Severity {
    /// The finding fails `lint`.
    Error,
    /// The finding prints above `<folder>: valid`.
    Warning,
}

impl Severity {
    /// The word `formatFinding` writes for this severity.
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Warning => "warning",
        }
    }
}

/// One proposal rule or banned word finding, as TypeScript's `LintFinding` holds it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Finding {
    /// Whether the finding fails the change.
    pub(crate) severity: Severity,
    /// The file the finding concerns, relative to the project root.
    pub(crate) file: String,
    /// The section or requirement within the file, when one applies.
    pub(crate) section: Option<String>,
    /// What is wrong.
    pub(crate) message: String,
}

impl Finding {
    /// Builds a finding with a file and an optional section.
    pub(crate) fn new(
        severity: Severity,
        file: impl Into<String>,
        section: Option<&str>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            severity,
            file: file.into(),
            section: section.map(str::to_owned),
            message: message.into(),
        }
    }
}

/// Where a report finding came from, with the data that rendered it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Origin {
    /// A proposal, task, entry or banned word rule finding.
    Rule(Finding),
    /// A finding rust-specs' validation gives.
    Spec(SpecFinding),
    /// A refused merge into a living spec.
    Merge {
        /// The delta spec's path.
        path: PathBuf,
        /// The refusal.
        error: MergeError,
    },
    /// A link gate finding.
    Link(LinkFinding),
}

/// One finding a checked change or the repository gives, as data for text and JSON.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ReportFinding {
    /// Where the finding came from.
    pub(crate) origin: Origin,
    /// Whether the finding fails the change.
    pub(crate) severity: Severity,
    /// The file the finding concerns, relative to the project root.
    pub(crate) file: String,
    /// The 1-based line the finding points at, when one applies.
    pub(crate) line: Option<usize>,
    /// The requirement the finding names, when one applies.
    pub(crate) requirement: Option<String>,
    /// The section the finding names, when one applies.
    pub(crate) section: Option<String>,
    /// What is wrong.
    pub(crate) message: String,
}

impl ReportFinding {
    /// Builds a report finding from a proposal, task, entry or banned word finding.
    pub(crate) fn rule(finding: Finding) -> Self {
        Self {
            origin: Origin::Rule(finding.clone()),
            severity: finding.severity,
            file: finding.file,
            line: None,
            requirement: None,
            section: finding.section,
            message: finding.message,
        }
    }

    /// Builds a report finding from a spec finding, with its file under the root.
    pub(crate) fn spec(root: &Path, finding: SpecFinding) -> Self {
        let file = text::relative(root, Path::new(&finding.file));
        Self {
            origin: Origin::Spec(finding.clone()),
            severity: Severity::Error,
            file,
            line: Some(finding.line),
            requirement: finding.requirement,
            section: None,
            message: finding.message,
        }
    }

    /// Builds a report finding from a refused merge, with its file under the root.
    pub(crate) fn merge(root: &Path, path: PathBuf, error: MergeError) -> Self {
        let file = text::relative(root, &path);
        let message = error.to_string();
        Self {
            origin: Origin::Merge { path, error },
            severity: Severity::Error,
            file,
            line: None,
            requirement: None,
            section: None,
            message,
        }
    }

    /// Builds a report finding from a link gate finding.
    pub(crate) fn link(finding: LinkFinding) -> Self {
        let file = finding.location.as_ref().map_or_else(
            || finding.node.to_string(),
            std::string::ToString::to_string,
        );
        Self {
            origin: Origin::Link(finding.clone()),
            severity: Severity::Error,
            file,
            line: None,
            requirement: None,
            section: None,
            message: finding.message,
        }
    }
}
