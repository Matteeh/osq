//! The `Feature` trait every feature crate implements, and the plain data it
//! names, with no IO.
//!
//! A feature gives its name, lists its commands as [`Command`] values and runs
//! one command from an [`Invocation`] to an [`Output`] or a [`FeatureError`].
//! Apps hold features as `Box<dyn Feature>` and dispatch a command to the
//! first feature that lists it.

use std::fmt;
use std::path::PathBuf;

/// One feature: its name, its commands and how it runs one.
///
/// Implements: rust-core/feature-trait
pub trait Feature {
    /// The feature's name, the same as its crate folder.
    ///
    /// Implements: rust-core/feature-trait
    fn name(&self) -> &str;

    /// The commands the feature offers, as plain data.
    ///
    /// Implements: rust-core/feature-trait
    fn commands(&self) -> Vec<Command>;

    /// Runs one command, returning its text or a typed error.
    ///
    /// # Errors
    ///
    /// Returns a [`FeatureError`] when the command is unknown, its arguments
    /// cannot be read, or it fails after reading them.
    ///
    /// Implements: rust-core/feature-trait
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError>;
}

/// One command a feature offers: its name, a one-line summary and its usage.
///
/// Build it with [`Command::new`].
///
/// Implements: rust-core/feature-trait
#[non_exhaustive]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Command {
    /// The command's name, as the CLI spells it.
    pub name: String,
    /// A one-line summary for help.
    pub summary: String,
    /// The usage text for the command's arguments.
    pub usage: String,
}

impl Command {
    /// Builds a command from its name, summary and usage.
    ///
    /// Implements: rust-core/feature-constructors
    #[must_use]
    pub fn new(
        name: impl Into<String>,
        summary: impl Into<String>,
        usage: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            summary: summary.into(),
            usage: usage.into(),
        }
    }
}

/// One call of a feature's command: the project root, the name and the args.
///
/// Build it with [`Invocation::new`].
///
/// Implements: rust-core/feature-trait
#[non_exhaustive]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Invocation {
    /// The project root the feature runs against.
    pub root: PathBuf,
    /// The command's name.
    pub command: String,
    /// The arguments exactly as the user gave them.
    pub args: Vec<String>,
}

impl Invocation {
    /// Builds an invocation from its root, command and arguments.
    ///
    /// Implements: rust-core/feature-constructors
    #[must_use]
    pub fn new(root: impl Into<PathBuf>, command: impl Into<String>, args: Vec<String>) -> Self {
        Self {
            root: root.into(),
            command: command.into(),
            args,
        }
    }
}

/// What a command prints: its text and the code the process exits with.
///
/// Build it with [`Output::text`] or [`Output::with_code`].
///
/// Implements: rust-core/feature-trait
#[non_exhaustive]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Output {
    /// The text to print.
    pub text: String,
    /// The process exit code.
    pub code: i32,
}

impl Output {
    /// Builds output from its text, with the exit code 0.
    ///
    /// Implements: rust-core/feature-constructors
    #[must_use]
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            code: 0,
        }
    }

    /// Builds output from its text and the exit code it is given.
    ///
    /// Implements: rust-core/feature-constructors
    #[must_use]
    pub fn with_code(text: impl Into<String>, code: i32) -> Self {
        Self {
            text: text.into(),
            code,
        }
    }
}

/// Why a command did not produce output.
///
/// Build it with [`FeatureError::unknown_command`], [`FeatureError::usage`] or
/// [`FeatureError::failed`], and match it with a wildcard arm.
///
/// Implements: rust-core/feature-errors
#[non_exhaustive]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FeatureError {
    /// The feature does not offer the command.
    #[non_exhaustive]
    UnknownCommand(String),
    /// The feature cannot read the command's arguments.
    #[non_exhaustive]
    Usage {
        /// The command whose arguments could not be read.
        command: String,
        /// What is wrong with the arguments.
        message: String,
    },
    /// The command read its arguments and then failed.
    #[non_exhaustive]
    Failed {
        /// The command that failed.
        command: String,
        /// What went wrong.
        message: String,
    },
}

impl FeatureError {
    /// Builds an error for a command the feature does not offer.
    ///
    /// Implements: rust-core/feature-constructors
    #[must_use]
    pub fn unknown_command(name: impl Into<String>) -> Self {
        Self::UnknownCommand(name.into())
    }

    /// Builds an error for arguments the feature cannot read.
    ///
    /// Implements: rust-core/feature-constructors
    #[must_use]
    pub fn usage(command: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Usage {
            command: command.into(),
            message: message.into(),
        }
    }

    /// Builds an error for a command that read its arguments and then failed.
    ///
    /// Implements: rust-core/feature-constructors
    #[must_use]
    pub fn failed(command: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Failed {
            command: command.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for FeatureError {
    /// Writes the typed error as one line of text.
    ///
    /// Implements: rust-core/feature-errors
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownCommand(name) => write!(formatter, "unknown command: {name}"),
            Self::Usage { command, message } => {
                write!(formatter, "usage of {command}: {message}")
            }
            Self::Failed { command, message } => write!(formatter, "{command} failed: {message}"),
        }
    }
}

impl std::error::Error for FeatureError {}
