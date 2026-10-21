//! The prompt's `## Recent executor disclosures` section.

use std::cmp::Ordering;

use osq_kernel_storage::{ChangeSnapshot, Location};

use super::leading_number;

/// The newest archived changes whose result files the section quotes.
const RECENT_CHANGES: usize = 3;

/// The most UTF-16 code units the kept entries may hold.
const MAX_CHARACTERS: usize = 4000;

/// The marker appended to the last entry when the budget cuts it.
const TRUNCATION_MARKER: &str = "[truncated]";

/// The sentence that labels every quoted disclosure as an unverified claim.
const CLAIM: &str = "Executor claims from result files, not verified facts. Check them against the code before relying on them.";

/// One disclosure section with its shown name and the storage field it quotes.
type Section = (
    &'static str,
    fn(&osq_kernel_storage::TaskDisclosure) -> Option<&str>,
);

/// The three quoted sections, in the order they are shown within a task.
const SECTIONS: [Section; 3] = [
    ("deviated", |task| task.deviated.as_deref()),
    ("missing context", |task| task.missing_context.as_deref()),
    ("outside scope", |task| task.outside_scope.as_deref()),
];

/// Builds the disclosures section's body, or none without a real disclosure.
///
/// Implements: rust-plan/disclosures-section
pub(super) fn body(snapshots: &[ChangeSnapshot]) -> Option<String> {
    let mut entries = Vec::new();
    for snapshot in recent_archived(snapshots) {
        for task in &snapshot.disclosures {
            for (display, text) in SECTIONS {
                if let Some(text) = text(task) {
                    entries.push(format!(
                        "{} task {}, {}:\n{}",
                        snapshot.folder,
                        task.task,
                        display,
                        quote(text)
                    ));
                }
            }
        }
    }
    if entries.is_empty() {
        return None;
    }
    let mut parts = Vec::new();
    let mut used = 0_usize;
    for entry in entries {
        let length = utf16_len(&entry);
        let remaining = MAX_CHARACTERS.saturating_sub(used);
        if length <= remaining {
            used += length;
            parts.push(entry);
            continue;
        }
        let limit = remaining.max(utf16_len(TRUNCATION_MARKER));
        parts.push(truncate(&entry, limit));
        break;
    }
    Some(format!("{CLAIM}\n\n{}", parts.join("\n\n")))
}

/// The newest archived snapshots of the record's window, first three only.
fn recent_archived(snapshots: &[ChangeSnapshot]) -> Vec<&ChangeSnapshot> {
    let mut archived: Vec<&ChangeSnapshot> = snapshots
        .iter()
        .filter(|snapshot| snapshot.location == Location::Archived)
        .collect();
    archived.sort_by(|left, right| {
        match (leading_number(&left.folder), leading_number(&right.folder)) {
            (Some(a), Some(b)) => b.cmp(&a).then_with(|| left.folder.cmp(&right.folder)),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => left.folder.cmp(&right.folder),
        }
    });
    archived.truncate(RECENT_CHANGES);
    archived
}

/// Prefixes every line with `> `, splitting on `\n` or `\r\n`.
fn quote(text: &str) -> String {
    text.lines()
        .map(|line| format!("> {line}"))
        .collect::<Vec<String>>()
        .join("\n")
}

/// Cuts an entry to `limit` code units, ending it with the marker.
fn truncate(entry: &str, limit: usize) -> String {
    let budget = limit.saturating_sub(utf16_len(TRUNCATION_MARKER));
    let cut = take_units(entry, budget).trim_end_matches('\n');
    format!("{cut}{TRUNCATION_MARKER}")
}

/// The length of text in UTF-16 code units, as JavaScript counts it.
fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// The longest prefix of text no longer than `limit` UTF-16 code units.
fn take_units(text: &str, limit: usize) -> &str {
    let mut units = 0_usize;
    for (index, character) in text.char_indices() {
        let width = character.len_utf16();
        if units + width > limit {
            return &text[..index];
        }
        units += width;
    }
    text
}
