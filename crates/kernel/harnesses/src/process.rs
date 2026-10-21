//! Running one harness program with its own environment and a bounded lifetime.
//!
//! The runner starts a program, streams its stdout lines to the caller, collects
//! stderr, and stops the program with the system `kill` utility when a timeout
//! passes. ADR 007 gives the program only the environment its caller declares.

mod readers;
mod runner;
mod state;

use std::collections::BTreeMap;
use std::fmt;
use std::path::PathBuf;
use std::time::Duration;

pub use runner::run_process;

/// Everything the runner needs to start one program.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessSpec {
    /// The program to start.
    pub program: String,
    /// The arguments passed to the program.
    pub args: Vec<String>,
    /// The folder the program runs in.
    pub cwd: PathBuf,
    /// The only variables the program sees.
    pub env: BTreeMap<String, String>,
    /// How long the program may run, or `None` for no limit.
    pub timeout: Option<Duration>,
    /// How long the runner waits after a stop or an exit.
    pub kill_grace: Duration,
}

/// How one program run ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessOutcome {
    /// The program's exit code, mapped for signals and timeouts.
    pub exit_code: i32,
    /// Whether the runner stopped the program after its timeout.
    pub timed_out: bool,
    /// Everything the program wrote to stderr.
    pub stderr: String,
}

/// Why the runner could not do its work.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProcessError {
    /// The program could not be started.
    Spawn {
        /// The program the runner tried to start.
        program: String,
        /// The operating system's error text.
        message: String,
    },
}

impl fmt::Display for ProcessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Spawn { program, message } => {
                write!(formatter, "cannot start {program}: {message}")
            }
        }
    }
}

impl std::error::Error for ProcessError {}
