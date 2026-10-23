//! A finding the proposal and banned word rules give, before `text` writes it.

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
