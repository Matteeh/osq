//! Why a git read failed.
//!
//! Implements: rust-vcs/git-command

use std::fmt;

/// Why a git read failed.
#[derive(Debug)]
pub enum VcsError {
    /// The git program could not be started.
    Spawn {
        /// The program and every argument, joined by single spaces.
        command: String,
        /// The operating system's error starting the program.
        source: std::io::Error,
    },
}

impl fmt::Display for VcsError {
    /// Writes `could not run <command>: <source>`.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Spawn { command, source } => {
                write!(formatter, "could not run {command}: {source}")
            }
        }
    }
}

impl std::error::Error for VcsError {
    /// The error that caused this one.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Spawn { source, .. } => Some(source),
        }
    }
}
