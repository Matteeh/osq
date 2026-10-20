//! The named entries of a delta spec, and its duplicate and conflict rules.

use super::delta_scan::DeltaOutline;
use super::finding::{FindingCode, SpecFinding};
use crate::markdown::RenameSide;

/// The five delta entry kinds a duplicate or a conflict compares.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    /// A requirement under an ADDED section.
    Added,
    /// A requirement under a MODIFIED section.
    Modified,
    /// A requirement name under a REMOVED section.
    Removed,
    /// The old name of a rename pair.
    From,
    /// The new name of a rename pair.
    To,
}

/// One named delta entry, with its kind and line.
pub(crate) struct Entry {
    /// The 1-based line of the entry.
    pub(crate) line: usize,
    /// The requirement name the entry carries.
    pub(crate) name: String,
    /// The operation the entry belongs to.
    pub(crate) kind: Kind,
}

/// Every named entry of the delta, in document order.
pub(crate) fn entries(scan: &DeltaOutline) -> Vec<Entry> {
    let mut entries = Vec::new();
    for requirement in &scan.requirements {
        let Some(kind) = requirement
            .section
            .and_then(|index| scan.sections.get(index))
            .and_then(|section| operation_kind(&section.title))
        else {
            continue;
        };
        entries.push(Entry {
            line: requirement.line,
            name: requirement.requirement.name.clone(),
            kind,
        });
    }
    entries.extend(scan.removed.iter().map(|removed| Entry {
        line: removed.line,
        name: removed.name.clone(),
        kind: Kind::Removed,
    }));
    entries.extend(scan.renames.iter().map(|rename| Entry {
        line: rename.line,
        name: rename.name.clone(),
        kind: match rename.side {
            RenameSide::From => Kind::From,
            RenameSide::To => Kind::To,
        },
    }));
    entries.sort_by_key(|entry| entry.line);
    entries
}

/// The entry kind of an ADDED or MODIFIED requirement, or none.
pub(crate) fn operation_kind(title: &str) -> Option<Kind> {
    if title.eq_ignore_ascii_case("ADDED Requirements") {
        Some(Kind::Added)
    } else if title.eq_ignore_ascii_case("MODIFIED Requirements") {
        Some(Kind::Modified)
    } else {
        None
    }
}

/// The duplicate-requirement findings of each entry kind.
pub(crate) fn duplicate_findings(file: &str, entries: &[Entry], findings: &mut Vec<SpecFinding>) {
    for kind in [
        Kind::Added,
        Kind::Modified,
        Kind::Removed,
        Kind::From,
        Kind::To,
    ] {
        let mut seen: Vec<&str> = Vec::new();
        for entry in entries.iter().filter(|entry| entry.kind == kind) {
            if seen.contains(&entry.name.as_str()) {
                let name = &entry.name;
                findings.push(SpecFinding::new(
                    FindingCode::DuplicateRequirement,
                    file,
                    entry.line,
                    Some(name.clone()),
                    format!("the delta names `{name}` more than once"),
                ));
            } else {
                seen.push(entry.name.as_str());
            }
        }
    }
}

/// The conflicting-delta findings of every pair of entries.
pub(crate) fn conflict_findings(file: &str, entries: &[Entry], findings: &mut Vec<SpecFinding>) {
    for (later, second) in entries.iter().enumerate() {
        for first in &entries[..later] {
            if first.name != second.name || !conflicts(first.kind, second.kind) {
                continue;
            }
            let name = &second.name;
            findings.push(SpecFinding::new(
                FindingCode::ConflictingDelta,
                file,
                second.line,
                Some(name.clone()),
                format!("the delta names `{name}` in two conflicting operations"),
            ));
        }
    }
}

/// True for two entry kinds the rules call a conflict.
fn conflicts(left: Kind, right: Kind) -> bool {
    let pair = |first: Kind, second: Kind| {
        matches!(
            (first, second),
            (Kind::Added | Kind::From, Kind::Modified | Kind::Removed)
                | (Kind::Modified, Kind::Removed)
                | (Kind::To, Kind::Added)
        )
    };
    pair(left, right) || pair(right, left)
}
