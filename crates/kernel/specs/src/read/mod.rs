//! Reading a specs document from disk and parsing it.

use crate::document::{ChecklistItem, Proposal, Sidecar, SidecarError, TaskFile, parse_proposal};
use crate::document::{SyntaxError, parse_sidecar, parse_task_file, parse_task_list};
use crate::markdown::{Delta, LivingSpec, parse_delta, parse_living_spec};
use serde::Serialize;
use std::fmt;
use std::path::{Path, PathBuf};

/// Why reading or parsing a specs document failed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum SpecsError {
    /// The file could not be read or is not UTF-8.
    Read {
        /// The path that could not be read.
        path: PathBuf,
        /// The operating system's message.
        message: String,
    },
    /// The document has a syntax error.
    Syntax {
        /// The path that holds the document.
        path: PathBuf,
        /// The 1-based line the error points at.
        line: usize,
        /// What went wrong.
        message: String,
    },
    /// A sidecar's fields are wrong.
    Sidecar {
        /// The path that holds the sidecar.
        path: PathBuf,
        /// The problems found, in order.
        problems: Vec<String>,
    },
}

impl fmt::Display for SpecsError {
    /// Writes the error's message, naming the file and, for a syntax error, its line.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read { path, message } => write!(formatter, "{}: {message}", path.display()),
            Self::Syntax {
                path,
                line,
                message,
            } => {
                write!(formatter, "{}:{line}: {message}", path.display())
            }
            Self::Sidecar { path, problems } => {
                write!(formatter, "{}: {}", path.display(), problems.join("; "))
            }
        }
    }
}

impl std::error::Error for SpecsError {}

/// Reads and parses a living capability spec.
///
/// # Errors
///
/// Returns a `SpecsError` when the file cannot be read or is not UTF-8.
///
/// Implements: rust-specs/file-readers
pub fn read_living_spec(path: &Path) -> Result<LivingSpec, SpecsError> {
    Ok(parse_living_spec(&read_text(path)?))
}

/// Reads and parses a delta spec.
///
/// # Errors
///
/// Returns a `SpecsError` when the file cannot be read or is not UTF-8.
///
/// Implements: rust-specs/file-readers
pub fn read_delta(path: &Path) -> Result<Delta, SpecsError> {
    Ok(parse_delta(&read_text(path)?))
}

/// Reads and parses a proposal.
///
/// # Errors
///
/// Returns a `SpecsError` when the file cannot be read or its frontmatter does
/// not parse.
///
/// Implements: rust-specs/file-readers
pub fn read_proposal(path: &Path) -> Result<Proposal, SpecsError> {
    let text = read_text(path)?;
    parse_proposal(&text).map_err(|error| syntax_error(path, &error))
}

/// Reads and parses a task file.
///
/// # Errors
///
/// Returns a `SpecsError` when the file cannot be read or its frontmatter does
/// not parse.
///
/// Implements: rust-specs/file-readers
pub fn read_task_file(path: &Path) -> Result<TaskFile, SpecsError> {
    let text = read_text(path)?;
    parse_task_file(&text).map_err(|error| syntax_error(path, &error))
}

/// Reads and parses a `tasks.md` checklist.
///
/// # Errors
///
/// Returns a `SpecsError` when the file cannot be read or is not UTF-8.
///
/// Implements: rust-specs/file-readers
pub fn read_task_list(path: &Path) -> Result<Vec<ChecklistItem>, SpecsError> {
    Ok(parse_task_list(&read_text(path)?))
}

/// Reads and parses an `osq.yml` sidecar.
///
/// # Errors
///
/// Returns a `SpecsError` when the file cannot be read or the sidecar has a
/// syntax error or problems.
///
/// Implements: rust-specs/file-readers
pub fn read_sidecar(path: &Path) -> Result<Sidecar, SpecsError> {
    let text = read_text(path)?;
    parse_sidecar(&text).map_err(|error| match error {
        SidecarError::Syntax(error) => syntax_error(path, &error),
        SidecarError::Problems(problems) => SpecsError::Sidecar {
            path: path.to_path_buf(),
            problems,
        },
    })
}

/// Reads one file as UTF-8 text, naming its path when it cannot.
fn read_text(path: &Path) -> Result<String, SpecsError> {
    std::fs::read_to_string(path).map_err(|error| SpecsError::Read {
        path: path.to_path_buf(),
        message: error.to_string(),
    })
}

/// Builds a syntax error that names the file and line.
fn syntax_error(path: &Path, error: &SyntaxError) -> SpecsError {
    SpecsError::Syntax {
        path: path.to_path_buf(),
        line: error.line,
        message: error.message.clone(),
    }
}
