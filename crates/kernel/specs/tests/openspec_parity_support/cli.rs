//! Locating and running the `OpenSpec` CLI for the parity tests.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// The `OpenSpec` CLI the parity tests run.
#[derive(Debug, Clone)]
pub struct OpenSpecCli {
    /// The path the tests invoke.
    path: PathBuf,
}

impl OpenSpecCli {
    /// Finds the CLI: `OSQ_OPENSPEC_BIN` when set and not empty, else
    /// `node_modules/.bin/openspec` under `root`.
    #[must_use]
    pub fn locate(root: &Path) -> Self {
        let from_env = std::env::var_os("OSQ_OPENSPEC_BIN");
        let path = match from_env {
            Some(value) if !value.is_empty() => PathBuf::from(value),
            _ => root.join("node_modules/.bin/openspec"),
        };
        Self { path }
    }

    /// The CLI path.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Runs the CLI with `OPENSPEC_TELEMETRY=0` in `cwd`.
    ///
    /// # Panics
    ///
    /// Panics, naming the path, when the CLI cannot be started.
    #[must_use]
    pub fn run(&self, args: &[&str], cwd: &Path) -> Output {
        Command::new(&self.path)
            .args(args)
            .current_dir(cwd)
            .env("OPENSPEC_TELEMETRY", "0")
            .output()
            .unwrap_or_else(|error| {
                panic!(
                    "cannot run openspec {} -- {}: {error}",
                    self.path.display(),
                    args.join(" ")
                )
            })
    }

    /// The trimmed `--version` output.
    ///
    /// # Panics
    ///
    /// Panics, naming the path, when the CLI cannot be started or exits
    /// nonzero.
    #[must_use]
    pub fn version(&self, cwd: &Path) -> String {
        let output = self.run(&["--version"], cwd);
        assert!(
            output.status.success(),
            "openspec {} --version failed: {}",
            self.path.display(),
            text_of(&output)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }
}

/// True when `text` is exactly `<digits>.<digits>.<digits>`.
#[must_use]
pub fn is_version(text: &str) -> bool {
    let parts: Vec<&str> = text.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}

/// The stdout and stderr of one run, joined and truncated to 500 characters.
#[must_use]
pub fn text_of(output: &Output) -> String {
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    text.chars().take(500).collect()
}
