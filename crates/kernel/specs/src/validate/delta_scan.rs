//! A line-accurate scan of a delta spec: sections, requirements, removed names and renames.

use super::outline::{RequirementOutline, scan};
use crate::markdown::delta::{
    Section, is_invalid_rename, removed_bullet_name, rename_side, split_sections,
};
use crate::markdown::requirement::requirement_header_name;
use crate::markdown::text::{fence_mask, normalize_document};
use crate::markdown::types::RenameSide;

/// One delta entry that carries a requirement name and a line.
pub(crate) struct NamedLine {
    /// The 1-based line of the entry.
    pub(crate) line: usize,
    /// The requirement name the entry carries.
    pub(crate) name: String,
}

/// One valid rename side of a delta spec, with its line.
pub(crate) struct RenameLine {
    /// The 1-based line of the side.
    pub(crate) line: usize,
    /// Whether the side is a FROM or a TO.
    pub(crate) side: RenameSide,
    /// The requirement name the side carries.
    pub(crate) name: String,
}

/// One `##` heading of a delta spec, with whether it holds any entry.
pub(crate) struct DeltaSection {
    /// The 1-based line of the heading.
    pub(crate) line: usize,
    /// The trimmed heading title.
    pub(crate) title: String,
    /// True when the section holds a requirement header, a removed name or a
    /// rename line.
    pub(crate) has_entry: bool,
}

/// A delta document's sections, requirement blocks, removed names and renames.
pub(crate) struct DeltaOutline {
    /// The `##` headings outside code fences, in document order.
    pub(crate) sections: Vec<DeltaSection>,
    /// The requirement blocks outside code fences, in document order.
    pub(crate) requirements: Vec<RequirementOutline>,
    /// The requirement names of REMOVED sections, in document order.
    pub(crate) removed: Vec<NamedLine>,
    /// The valid rename sides of RENAMED sections, in document order.
    pub(crate) renames: Vec<RenameLine>,
    /// The 1-based lines of the invalid rename lines.
    pub(crate) invalid_renames: Vec<usize>,
    /// The rename sides without a partner, in document order.
    pub(crate) unpaired: Vec<NamedLine>,
}

/// The entries a delta scan collects while walking its sections.
#[derive(Default)]
struct Collected {
    /// The requirement names of REMOVED sections.
    removed: Vec<NamedLine>,
    /// The valid rename sides of RENAMED sections.
    renames: Vec<RenameLine>,
    /// The 1-based lines of the invalid rename lines.
    invalid_renames: Vec<usize>,
    /// The rename sides without a partner.
    unpaired: Vec<NamedLine>,
}

/// Scans a delta document into its sections, requirements, removed names and renames.
pub(crate) fn scan_delta(text: &str) -> DeltaOutline {
    let outline = scan(text);
    let normalized = normalize_document(text);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mask = fence_mask(&lines);
    let sections = split_sections(&lines, &mask);
    let mut collected = Collected::default();
    let mut scanned = Vec::with_capacity(sections.len());
    for (position, section) in sections.iter().enumerate() {
        let line = outline
            .headings
            .get(position)
            .map_or(0, |heading| heading.line);
        scanned.push(scan_section(section, line, &mut collected));
    }
    DeltaOutline {
        sections: scanned,
        requirements: outline.requirements,
        removed: collected.removed,
        renames: collected.renames,
        invalid_renames: collected.invalid_renames,
        unpaired: collected.unpaired,
    }
}

/// Scans one section, collecting its entries and reporting whether it has any.
fn scan_section(section: &Section<'_>, line: usize, collected: &mut Collected) -> DeltaSection {
    let removed_section = section.title.eq_ignore_ascii_case("REMOVED Requirements");
    let renamed_section = section.title.eq_ignore_ascii_case("RENAMED Requirements");
    let mut has_entry = false;
    let mut pending: Option<(usize, String)> = None;
    for (offset, text) in section.lines.iter().enumerate() {
        if section.mask[offset] {
            continue;
        }
        let at = line.saturating_add(offset).saturating_add(1);
        if requirement_header_name(text).is_some()
            || removed_bullet_name(text).is_some()
            || rename_side(text).is_some()
            || is_invalid_rename(text)
        {
            has_entry = true;
        }
        if removed_section {
            collect_removed(text, at, collected);
        }
        if renamed_section {
            collect_rename(text, at, &mut pending, collected);
        }
    }
    if let Some((old_line, old_name)) = pending {
        collected.unpaired.push(NamedLine {
            line: old_line,
            name: old_name,
        });
    }
    DeltaSection {
        line,
        title: section.title.clone(),
        has_entry,
    }
}

/// Adds a REMOVED name of `text` to the collection.
fn collect_removed(text: &str, at: usize, collected: &mut Collected) {
    let name = requirement_header_name(text).or_else(|| removed_bullet_name(text));
    if let Some(name) = name {
        collected.removed.push(NamedLine { line: at, name });
    }
}

/// Adds a rename side of `text`, pairing it with a pending side or unpairing it.
fn collect_rename(
    text: &str,
    at: usize,
    pending: &mut Option<(usize, String)>,
    collected: &mut Collected,
) {
    let Some((side, name)) = rename_side(text) else {
        if is_invalid_rename(text) {
            collected.invalid_renames.push(at);
        }
        return;
    };
    collected.renames.push(RenameLine {
        line: at,
        side,
        name: name.clone(),
    });
    match side {
        RenameSide::From => {
            if let Some((old_line, old_name)) = pending.take() {
                collected.unpaired.push(NamedLine {
                    line: old_line,
                    name: old_name,
                });
            }
            *pending = Some((at, name));
        }
        RenameSide::To => {
            if pending.take().is_none() {
                collected.unpaired.push(NamedLine { line: at, name });
            }
        }
    }
}
