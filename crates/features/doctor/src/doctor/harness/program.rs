//! Choosing the program each harness's doctor probe runs.

use std::collections::BTreeMap;

use osq_kernel_config::{Config, Harness};
use osq_kernel_harnesses::resolve_pi_binary;

/// The variable agy's program falls back to.
const AGY_PATH_VARIABLE: &str = "AGY_PATH";
/// The variable opencode's program falls back to.
const OPENCODE_PATH_VARIABLE: &str = "OPENCODE_PATH";
/// The variable codex's program falls back to.
const CODEX_PATH_VARIABLE: &str = "CODEX_PATH";
/// The program agy runs when nothing names another.
const AGY_PROGRAM: &str = "agy";
/// The program opencode runs when nothing names another.
const OPENCODE_PROGRAM: &str = "opencode";
/// The program codex runs when nothing names another.
const CODEX_PROGRAM: &str = "codex";
/// The program claude runs when nothing names another.
const CLAUDE_PROGRAM: &str = "claude";

/// Resolves the program a harness probes, or none when it needs no executable.
///
/// Implements: rust-doctor/doctor-harness-checks
pub(super) fn resolve(
    harness: Harness,
    config: &Config,
    env: &BTreeMap<String, String>,
) -> Option<String> {
    match harness {
        Harness::Mock => None,
        Harness::Agy => Some(
            non_empty(env, AGY_PATH_VARIABLE)
                .unwrap_or(AGY_PROGRAM)
                .to_owned(),
        ),
        Harness::Opencode => Some(
            non_empty(env, OPENCODE_PATH_VARIABLE)
                .or(config.opencode.bin.as_deref())
                .unwrap_or(OPENCODE_PROGRAM)
                .to_owned(),
        ),
        Harness::Codex => Some(codex_program(config, env)),
        Harness::Claude => Some(
            config
                .claude
                .bin
                .clone()
                .unwrap_or_else(|| CLAUDE_PROGRAM.to_owned()),
        ),
        Harness::Pi => Some(resolve_pi_binary(config.pi.bin.as_deref(), env)),
    }
}

/// The codex program from its setting, then the trimmed variable, then codex.
///
/// Implements: rust-doctor/doctor-harness-checks
fn codex_program(config: &Config, env: &BTreeMap<String, String>) -> String {
    if let Some(bin) = &config.codex.bin {
        return bin.clone();
    }
    let from_env = env
        .get(CODEX_PATH_VARIABLE)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    from_env.unwrap_or_else(|| CODEX_PROGRAM.to_owned())
}

/// Returns the variable's text when it is set and not empty.
///
/// Implements: rust-doctor/doctor-harness-checks
fn non_empty<'a>(env: &'a BTreeMap<String, String>, name: &str) -> Option<&'a str> {
    env.get(name)
        .map(String::as_str)
        .filter(|value| !value.is_empty())
}
