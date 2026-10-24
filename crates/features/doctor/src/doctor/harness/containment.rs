//! The containment lines the harness catalog reports for one configuration.

use osq_kernel_config::{Config, Harness};

/// TypeScript's default opencode agent, held in code as it holds it (ADR 029).
const OPENCODE_DEFAULT_AGENT: &str = "osq-coder";
/// The warning when agy approves every tool call.
const AGY_BYPASS: &str = "agy.dangerouslySkipPermissions is true: agy approves every tool call, so nothing stops git, network tools, or sudo";
/// The failure when agy would ask every tool call a headless task cannot answer.
const AGY_PROMPTS: &str = "agy asks before every tool call and a headless task cannot answer; set agy.dangerouslySkipPermissions: true to accept that, or choose another harness";
/// The opencode line when its selected agent is osq's.
const OPENCODE_DEFAULT: &str = "osq-coder agent denies git, curl, wget, ssh, scp, sudo, and web tools; shell unconfined with open network";
/// The codex line for its workspace-write sandbox.
const CODEX: &str =
    "workspace-write sandbox: writes confined to the project, .git read-only, no network";
/// The pi line for an agent nothing confines.
const PI: &str = "nothing confines the agent: no permission prompts, no sandbox, open network";
/// The claude line when its Bash tool runs sandboxed.
const CLAUDE_SANDBOXED: &str =
    "file tools confined to the project; git denied; Bash sandboxed with no network";
/// The claude line when its Bash tool runs unconfined.
const CLAUDE_UNCONFINED: &str =
    "file tools confined to the project; git denied; Bash unconfined with open network";

/// Builds the `harness-containment` line for one harness and loaded config.
///
/// Implements: rust-doctor/doctor-harness-checks
pub(super) fn line(config: &Config, harness: Harness) -> String {
    match harness {
        Harness::Agy if config.agy.dangerously_skip_permissions => warn(AGY_BYPASS),
        Harness::Agy => format!("[fail] harness-containment: {AGY_PROMPTS}"),
        Harness::Opencode => opencode_line(&config.opencode.agent),
        Harness::Mock => ok("no agent process"),
        Harness::Codex => ok(CODEX),
        Harness::Pi => ok(PI),
        Harness::Claude if config.claude.sandbox => ok(CLAUDE_SANDBOXED),
        Harness::Claude => ok(CLAUDE_UNCONFINED),
    }
}

/// Builds opencode's line from its selected agent.
///
/// Implements: rust-doctor/doctor-harness-checks
fn opencode_line(agent: &str) -> String {
    if agent == OPENCODE_DEFAULT_AGENT {
        return ok(OPENCODE_DEFAULT);
    }
    warn(&format!(
        "opencode.agent is {agent}, not osq-coder: that agent's own permissions apply, not osq's denials"
    ))
}

/// Wraps a passing containment message.
///
/// Implements: rust-doctor/doctor-harness-checks
fn ok(message: &str) -> String {
    format!("[ok] harness-containment: {message}")
}

/// Wraps a containment warning.
///
/// Implements: rust-doctor/doctor-harness-checks
fn warn(message: &str) -> String {
    format!("[warn] harness-containment: {message}")
}
