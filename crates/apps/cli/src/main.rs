//! The osq binary: read the process's arguments, run the command line and print.

use std::env;
use std::io::{self, Write};
use std::path::PathBuf;

/// Runs one command line from the process's arguments and current directory.
///
/// Implements: rust-cli/cli-entry-point
fn main() {
    match run() {
        Ok(result) => {
            let _ = io::stdout().write_all(result.stdout.as_bytes());
            let _ = io::stderr().write_all(result.stderr.as_bytes());
            std::process::exit(result.code);
        }
        Err(message) => {
            let _ = writeln!(io::stderr(), "{message}");
            std::process::exit(1);
        }
    }
}

/// Reads the invocation's inputs and runs the CLI, or returns one error line.
fn run() -> Result<osq_cli::CliResult, String> {
    let args = arguments()?;
    let root = root()?;
    Ok(osq_cli::run_cli(&osq_cli::features(), &root, &args))
}

/// The process's arguments after the program name, all as UTF-8.
fn arguments() -> Result<Vec<String>, String> {
    env::args_os()
        .skip(1)
        .map(|argument| {
            argument.into_string().map_err(|value| {
                format!(
                    "osq-rs: argument is not valid UTF-8: {}",
                    value.to_string_lossy()
                )
            })
        })
        .collect()
}

/// The process's current directory, as the project root.
fn root() -> Result<PathBuf, String> {
    env::current_dir()
        .map_err(|error| format!("osq-rs: cannot read the current directory: {error}"))
}
