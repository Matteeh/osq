//! The approval flag lines of an unapproved change.

use std::path::Path;

use osq_kernel_specs::{VerifyStarts, parse_frontmatter, parse_proposal, section};

use crate::model::Change;

use super::model::Digest;

mod capabilities;
mod decisions;
mod paths;
mod sensitive;
mod tasks;
mod verify;

/// The living specs folder TypeScript's default config names.
const OPENSPEC: &str = "openspec";

/// One `Flag:` line's label and excerpt.
pub(super) struct Flag {
    /// The text after `Flag: ` and before the em dash.
    label: String,
    /// The text after the em dash.
    excerpt: String,
}

impl Flag {
    /// Builds one flag from its label and excerpt.
    fn new(label: impl Into<String>, excerpt: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            excerpt: excerpt.into(),
        }
    }

    /// Formats the flag as TypeScript's `formatApprovalFlags` does.
    fn line(&self) -> String {
        format!("Flag: {} \u{2014} {}", self.label, self.excerpt)
    }
}

/// One task as the flag rules see it: identity, verify, start, scope and paths.
pub(super) struct TaskView {
    /// The task number from its file name.
    number: String,
    /// The trimmed verify command.
    verify: String,
    /// The state the verify starts in.
    starts: VerifyStarts,
    /// The declared scope entries.
    scope: Vec<String>,
    /// The resolved project-relative paths, including a missing exact entry.
    paths: Vec<String>,
    /// Whether the task may change preexisting tests.
    tests_modify: bool,
}

/// The proposal fields the flag rules read.
struct Proposal {
    /// The proposal's verify command.
    verify: String,
    /// The trimmed `## Decisions` section.
    decisions: String,
}

/// The `Flag:` lines in TypeScript's fixed order.
pub(super) fn lines(change: &Change, digest: &Digest) -> Vec<String> {
    let Some(root) = super::project_root(change) else {
        return Vec::new();
    };
    let proposal = proposal(change);
    let views = tasks::read(&root, change);
    let living = super::capability::living_names(&root, Path::new(OPENSPEC));
    let mut flags = sensitive::shared_files(&views);
    flags.extend(sensitive::sensitive_paths(&views, OPENSPEC));
    flags.extend(verify::without_test(&views, &proposal.verify));
    flags.extend(capabilities::removed(&digest.capabilities));
    flags.extend(capabilities::unknown(
        &digest.capabilities,
        &living,
        OPENSPEC,
    ));
    flags.extend(verify::starts_conflicts(&root, &views));
    flags.extend(decisions::flags(
        &root,
        &proposal.decisions,
        &views,
        OPENSPEC,
    ));
    flags.into_iter().map(|flag| flag.line()).collect()
}

/// Reads the proposal's verify command and decisions section, or empty text.
fn proposal(change: &Change) -> Proposal {
    let proposal = change.path.join("proposal.md");
    let path = if proposal.is_file() {
        proposal
    } else {
        change.path.join("spec.md")
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return Proposal {
            verify: String::new(),
            decisions: String::new(),
        };
    };
    let verify = parse_proposal(&text).map_or_else(|_| String::new(), |parsed| parsed.verify);
    let decisions = parse_frontmatter(&text)
        .map(|frontmatter| section(&frontmatter.body, "Decisions"))
        .unwrap_or_default();
    Proposal { verify, decisions }
}
