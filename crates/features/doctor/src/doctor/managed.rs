//! Doctor's managed-block check for the files `osq init` and `osq setup` write.
//!
//! The line is pure text; only this module reads the project's setup files
//! (ADR 023). The canonical blocks are TypeScript's, copied byte for byte.

use std::fs;
use std::path::Path;

use osq_kernel_config::{Config, Harness};

/// The marker every managed block opens with.
const START_MARKER: &str = "<!-- OSQ:START -->";
/// The marker every managed block closes with.
const END_MARKER: &str = "<!-- OSQ:END -->";
/// TypeScript's default opencode agent, held in code as it holds it (ADR 029).
const OPENCODE_AGENT: &str = "osq-coder";
/// The canonical `AGENTS.md` block.
const AGENTS_BLOCK: &str = include_str!("managed/agents-block.txt");
/// The canonical `PLANNER.md` block.
const PLANNER_BLOCK: &str = include_str!("managed/planner-block.txt");
/// The canonical Claude plan command.
const CLAUDE_PLAN_COMMAND: &str = include_str!("managed/claude-plan-command.txt");

/// The managed files `osq init` writes, paired with their canonical blocks.
const MANAGED_FILES: [(&str, &str); 3] = [
    ("AGENTS.md", AGENTS_BLOCK),
    ("PLANNER.md", PLANNER_BLOCK),
    (".claude/commands/osq-plan.md", CLAUDE_PLAN_COMMAND),
];

/// The problem texts TypeScript's `PROBLEM_TEXT` holds.
const MISSING_BLOCK: &str = "is missing its managed block";
/// The problem text for more than one marker of either kind.
const DUPLICATE_BLOCKS: &str = "has duplicate managed blocks";
/// The problem text for only one of the two markers.
const PARTIAL_BLOCK: &str = "has a partial managed block";
/// The problem text for an end marker before its start marker.
const REVERSED_BLOCK: &str = "has a reversed managed block";
/// The problem text for a block whose bytes differ from the canonical one.
const STALE_BLOCK: &str = "has a stale managed block";

/// Builds the `managed-blocks` line for one root and its loaded config.
///
/// Implements: rust-doctor/doctor-managed-blocks
pub(super) fn managed_blocks_line(root: &Path, config: &Config) -> String {
    let mut failures = Vec::new();
    for (path, canonical) in MANAGED_FILES {
        if let Some(failure) = file_failure(root, path, canonical) {
            failures.push(failure);
        }
    }
    let setup_failure = opencode_failure(root, config);
    let mut groups = Vec::new();
    if !failures.is_empty() {
        groups.push(format!("{} (run osq init)", failures.join("; ")));
    }
    if let Some(failure) = setup_failure {
        groups.push(format!("{failure} (run osq setup)"));
    }
    if groups.is_empty() {
        return "[ok] managed-blocks: managed blocks valid".to_owned();
    }
    format!("[fail] managed-blocks: {}", groups.join("; "))
}

/// The opencode agent file's failure, or none when opencode is not configured
/// or its file is current.
///
/// Implements: rust-doctor/doctor-managed-blocks
fn opencode_failure(root: &Path, config: &Config) -> Option<String> {
    if !opencode_configured(config) {
        return None;
    }
    let path = format!(".opencode/agent/{OPENCODE_AGENT}.md");
    file_failure(root, &path, AGENTS_BLOCK)
}

/// Whether either the executor or the planner harness is opencode.
///
/// Implements: rust-doctor/doctor-managed-blocks
fn opencode_configured(config: &Config) -> bool {
    config.executor.harness == Harness::Opencode || config.planner.harness == Harness::Opencode
}

/// One file's failure text, or none when it holds exactly the canonical block.
///
/// Implements: rust-doctor/doctor-managed-blocks
fn file_failure(root: &Path, path: &str, canonical: &str) -> Option<String> {
    let Ok(bytes) = fs::read(root.join(path)) else {
        return Some(format!("{path} is missing"));
    };
    let content = String::from_utf8_lossy(&bytes);
    inspect(&content, canonical).map(|problem| format!("{path} {problem}"))
}

/// The first matching problem of one document, or none when its block is
/// current.
///
/// Implements: rust-doctor/doctor-managed-blocks
fn inspect(content: &str, canonical: &str) -> Option<&'static str> {
    let starts = content.matches(START_MARKER).count();
    let ends = content.matches(END_MARKER).count();
    if starts == 0 && ends == 0 {
        return Some(MISSING_BLOCK);
    }
    if starts.max(ends) > 1 {
        return Some(DUPLICATE_BLOCKS);
    }
    if starts.min(ends) == 0 {
        return Some(PARTIAL_BLOCK);
    }
    let Some(start) = content.find(START_MARKER) else {
        return Some(PARTIAL_BLOCK);
    };
    let tail = &content[start..];
    let Some(offset) = tail.find(END_MARKER) else {
        return Some(REVERSED_BLOCK);
    };
    let block = &tail[..offset + END_MARKER.len()];
    if block == canonical {
        None
    } else {
        Some(STALE_BLOCK)
    }
}
