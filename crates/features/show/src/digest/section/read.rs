//! Reading a change into the data its approval digest prints.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_loop::scope_files;
use osq_kernel_specs::{
    AppliesTo, parse_delta, parse_frontmatter, parse_task_file, read_decisions, section,
};

use crate::model::Change;

use super::capability::{declared_creates, living_names, resembling_capability};
use super::model::{Digest, DigestCapability, DigestDecision, DigestTask};

/// Builds one change's approval digest against its project root.
pub(super) fn digest(change: &Change, root: &Path) -> Digest {
    let proposal = proposal(change);
    Digest {
        change: change.folder.clone(),
        goal: first_two_sentences(&change.goal),
        tasks: tasks(change, root),
        capabilities: capabilities(change, root, &proposal.creates),
        decisions: decisions(root, &change.writes),
        human_steps: proposal.human_steps,
        before_approval: change.before_approval.clone().unwrap_or_default(),
    }
}

/// The proposal fields the digest reads.
struct ProposalFields {
    /// The trimmed `## Human steps` section, or empty text.
    human_steps: String,
    /// The declared `creates` names.
    creates: Vec<String>,
}

/// Reads the change's proposal, or its spec when it has no proposal.
fn proposal(change: &Change) -> ProposalFields {
    let path = if change.path.join("proposal.md").is_file() {
        change.path.join("proposal.md")
    } else {
        change.path.join("spec.md")
    };
    let text = fs::read_to_string(path).unwrap_or_default();
    let Ok(frontmatter) = parse_frontmatter(&text) else {
        return ProposalFields {
            human_steps: String::new(),
            creates: Vec::new(),
        };
    };
    ProposalFields {
        human_steps: section(&frontmatter.body, "Human steps"),
        creates: declared_creates(&frontmatter.data),
    }
}

/// The change's task rows in task-number order.
fn tasks(change: &Change, root: &Path) -> Vec<DigestTask> {
    let Ok(entries) = fs::read_dir(change.path.join("tasks")) else {
        return Vec::new();
    };
    let mut files: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let number = name.strip_suffix(".md")?.to_owned();
            Some((number, entry.path()))
        })
        .collect();
    files.sort_by(|left, right| compare_tasks(&left.0, &right.0));
    files
        .into_iter()
        .map(|(number, path)| task(root, number, &path))
        .collect()
}

/// One task's digest row.
fn task(root: &Path, number: String, path: &Path) -> DigestTask {
    let text = fs::read_to_string(path).unwrap_or_default();
    let Ok(parsed) = parse_task_file(&text) else {
        return DigestTask {
            number,
            title: String::new(),
            scope_files: 0,
            tests_modify: false,
            existing_tests: Vec::new(),
        };
    };
    let existing: Vec<String> = scope_files(root, &parsed.scope)
        .into_iter()
        .filter(|file| root.join(file).is_file())
        .collect();
    let existing_tests = existing
        .iter()
        .filter(|file| is_gated_test(file))
        .cloned()
        .collect();
    DigestTask {
        number,
        title: parsed.title,
        scope_files: existing.len(),
        tests_modify: parsed.tests_modify,
        existing_tests,
    }
}

/// Orders task names by leading number, then by text.
fn compare_tasks(left: &str, right: &str) -> std::cmp::Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(left_number), Some(right_number)) => {
            left_number.cmp(&right_number).then_with(|| left.cmp(right))
        }
        _ => left.cmp(right),
    }
}

/// The integer a task name leads with.
fn leading_number(text: &str) -> Option<u128> {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

/// Whether a project-relative path is in the frozen-test gate's folder.
fn is_gated_test(path: &str) -> bool {
    path == "tests" || path.starts_with("tests/")
}

/// The written capabilities' digest rows in name order.
fn capabilities(change: &Change, root: &Path, declared: &[String]) -> Vec<DigestCapability> {
    let living = living_names(root, Path::new("openspec"));
    let mut capabilities = Vec::new();
    for name in &change.writes {
        let path = change.path.join("specs").join(name).join("spec.md");
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        let delta = parse_delta(&text);
        let creates = !living.contains(name)
            && (declared.contains(name)
                || (!delta.purpose.is_empty() && resembling_capability(name, &living).is_none()));
        capabilities.push(DigestCapability {
            name: name.clone(),
            added: delta
                .added
                .iter()
                .map(|requirement| requirement.name.clone())
                .collect(),
            modified: delta
                .modified
                .iter()
                .map(|requirement| requirement.name.clone())
                .collect(),
            removed: delta.removed,
            creates,
        });
    }
    capabilities
}

/// The accepted ADRs that govern the written capabilities, in number order.
fn decisions(root: &Path, written: &[String]) -> Vec<DigestDecision> {
    let records = read_decisions(root, Path::new("decisions"), Path::new("openspec"));
    records
        .adrs
        .into_iter()
        .filter(|adr| adr.status == "accepted" && governs(&adr.governs, written))
        .map(|adr| DigestDecision {
            number: adr.number,
            rule: adr.rule,
        })
        .collect()
}

/// Whether an ADR's `applies_to` covers one of the written capabilities.
fn governs(applies: &AppliesTo, written: &[String]) -> bool {
    match applies {
        AppliesTo::All => true,
        AppliesTo::Capabilities(names) => names.iter().any(|name| written.contains(name)),
    }
}

/// Collapses every whitespace run to one space and trims the text.
fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The first two sentences of a goal, whitespace-collapsed.
fn first_two_sentences(goal: &str) -> String {
    let collapsed = collapse_whitespace(goal);
    let mut sentences: Vec<&str> = Vec::new();
    let mut start = 0;
    for (index, character) in collapsed.char_indices() {
        if !matches!(character, '.' | '!' | '?') {
            continue;
        }
        let end = index.saturating_add(character.len_utf8());
        let whitespace = collapsed[end..]
            .chars()
            .next()
            .is_some_and(char::is_whitespace);
        if whitespace {
            sentences.push(&collapsed[start..end]);
            start = end.saturating_add(1);
        }
    }
    sentences.push(&collapsed[start..]);
    sentences
        .into_iter()
        .filter(|sentence| !sentence.is_empty())
        .take(2)
        .collect::<Vec<_>>()
        .join(" ")
}
