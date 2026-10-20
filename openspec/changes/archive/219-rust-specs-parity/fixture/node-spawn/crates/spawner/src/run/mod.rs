//! A nested module that spawns the OpenSpec CLI.

/// Validates specs with the OpenSpec CLI.
pub fn validate() {
    let _ = std::process::Command::new("openspec.cmd").arg("validate").status();
}
