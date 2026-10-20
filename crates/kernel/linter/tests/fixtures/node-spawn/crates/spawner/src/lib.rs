//! A fixture crate that spawns Node at runtime.

use std::process::Command;

mod run;

/// Runs a script with Node.
pub fn run_script() {
    let _ = std::process::Command::new("node").arg("script.js").status();
}

/// Runs a package binary with npx.
pub fn run_package() {
    let _ = Command::new("/usr/local/bin/npx").arg("tool").status();
}

/// Runs git, which is not Node.
pub fn run_git() {
    let _ = Command::new("git").arg("status").status();
}

/// Names Node in a string that spawns nothing.
pub fn name() -> &'static str {
    "node"
}

/// Spawns a program chosen at runtime, which the gate cannot name.
pub fn run_program(program: &str) {
    let _ = Command::new(program).status();
}
