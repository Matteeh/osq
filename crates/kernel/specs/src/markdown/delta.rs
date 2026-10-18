//! Parsing of delta specs and their four operations.

use super::requirement::{blocks_in, requirement_header_name, requirement_header_text};
use super::text::{
    is_js_whitespace, is_top_level_heading, js_trim, js_trim_end, normalize_document,
    normalize_requirement_name, strip_prefix_ci,
};
use super::types::{Delta, Rename, RenameSide, Requirement, UnpairedRename};

/// One top-level `##` section: its trimmed title and its body lines.
pub(crate) struct Section<'a> {
    /// The trimmed section title.
    pub(crate) title: String,
    /// The lines after the heading line.
    pub(crate) lines: Vec<&'a str>,
    /// The fence mask of `lines`.
    pub(crate) mask: Vec<bool>,
}

/// True when a line carries a bullet marker, returning the rest.
fn strip_bullet(line: &str) -> Option<&str> {
    let first = line.chars().next()?;
    if matches!(first, '-' | '*' | '+') {
        Some(&line[first.len_utf8()..])
    } else {
        None
    }
}

/// Reads an optionally backticked requirement header after a rename label.
fn rename_name(rest: &str) -> Option<String> {
    let rest = rest.trim_start_matches(is_js_whitespace);
    let rest = rest.strip_prefix('`').unwrap_or(rest);
    let text = requirement_header_text(rest)?;
    let text = js_trim_end(text);
    let text = text.strip_suffix('`').unwrap_or(text);
    Some(normalize_requirement_name(text))
}

/// The side and name of a valid `FROM:` or `TO:` line.
pub(crate) fn rename_side(line: &str) -> Option<(RenameSide, String)> {
    let rest = line.trim_start_matches(is_js_whitespace);
    let rest = strip_bullet(rest).unwrap_or(rest);
    let rest = rest.trim_start_matches(is_js_whitespace);
    let (side, rest) = rest
        .strip_prefix("FROM:")
        .map(|rest| (RenameSide::From, rest))
        .or_else(|| rest.strip_prefix("TO:").map(|rest| (RenameSide::To, rest)))?;
    rename_name(rest).map(|name| (side, name))
}

/// True for a line that starts a rename but not in the valid header form.
pub(crate) fn is_invalid_rename(line: &str) -> bool {
    let rest = line.trim_start_matches(is_js_whitespace);
    let rest = strip_bullet(rest).unwrap_or(rest);
    let rest = rest.trim_start_matches(is_js_whitespace);
    strip_prefix_ci(rest, "FROM:").is_some() || strip_prefix_ci(rest, "TO:").is_some()
}

/// A requirement name from a REMOVED bullet carrying a requirement header.
pub(crate) fn removed_bullet_name(line: &str) -> Option<String> {
    let rest = line.trim_start_matches(is_js_whitespace);
    let rest = strip_bullet(rest)?;
    let rest = rest.trim_start_matches(is_js_whitespace);
    rename_name(rest)
}

/// The title without a leading `Spec Delta:`.
fn delta_title(lines: &[&str], mask: &[bool]) -> String {
    for (index, line) in lines.iter().enumerate() {
        if mask[index] {
            continue;
        }
        let Some(rest) = line.strip_prefix('#') else {
            continue;
        };
        let Some(first) = rest.chars().next() else {
            continue;
        };
        if first != ' ' && first != '\t' {
            continue;
        }
        let raw = js_trim(rest);
        let title = strip_prefix_ci(raw, "Spec Delta")
            .and_then(|rest| {
                let rest = rest.trim_start_matches([' ', '\t']);
                let rest = rest.strip_prefix(':')?;
                Some(rest.trim_start_matches([' ', '\t']))
            })
            .unwrap_or(raw);
        return js_trim(title).to_string();
    }
    String::new()
}

/// Splits the top-level `##` sections, each to the next one.
pub(crate) fn split_sections<'a>(lines: &[&'a str], mask: &[bool]) -> Vec<Section<'a>> {
    let indices: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(index, line)| !mask[*index] && is_top_level_heading(line))
        .map(|(index, _)| index)
        .collect();
    let mut sections = Vec::with_capacity(indices.len());
    for (position, start) in indices.iter().enumerate() {
        let end = indices
            .get(position.saturating_add(1))
            .copied()
            .unwrap_or(lines.len());
        let title = js_trim(lines[*start].strip_prefix("##").unwrap_or_default()).to_string();
        sections.push(Section {
            title,
            lines: lines[start.saturating_add(1)..end].to_vec(),
            mask: mask[start.saturating_add(1)..end].to_vec(),
        });
    }
    sections
}

/// The sections whose title folds to `desired`, in document order.
fn bodies<'a, 'b>(sections: &'b [Section<'a>], desired: &str) -> Vec<&'b Section<'a>> {
    sections
        .iter()
        .filter(|section| section.title.eq_ignore_ascii_case(desired))
        .collect()
}

/// The requirement blocks of every matching section.
fn requirements_in(sections: &[Section<'_>], desired: &str) -> Vec<Requirement> {
    bodies(sections, desired)
        .iter()
        .flat_map(|section| blocks_in(&section.lines, &section.mask))
        .collect()
}

/// The requirement names of every REMOVED section.
fn removed_in(sections: &[Section<'_>]) -> Vec<String> {
    let mut names = Vec::new();
    for section in bodies(sections, "REMOVED Requirements") {
        for (index, line) in section.lines.iter().enumerate() {
            if section.mask[index] {
                continue;
            }
            if let Some(name) = requirement_header_name(line) {
                names.push(name);
            } else if let Some(name) = removed_bullet_name(line) {
                names.push(name);
            }
        }
    }
    names
}

/// The paired, invalid and unpaired entries of every RENAMED section.
fn renamed_in(sections: &[Section<'_>]) -> (Vec<Rename>, Vec<String>, Vec<UnpairedRename>) {
    let mut renamed = Vec::new();
    let mut invalid = Vec::new();
    let mut unpaired = Vec::new();
    let mut pending: Option<String> = None;

    for section in bodies(sections, "RENAMED Requirements") {
        for (index, line) in section.lines.iter().enumerate() {
            if section.mask[index] {
                continue;
            }
            if let Some((side, name)) = rename_side(line) {
                match side {
                    RenameSide::From => {
                        if let Some(old) = pending.take() {
                            unpaired.push(UnpairedRename {
                                side: RenameSide::From,
                                name: old,
                            });
                        }
                        pending = Some(name);
                    }
                    RenameSide::To => match pending.take() {
                        Some(from) => renamed.push(Rename { from, to: name }),
                        None => unpaired.push(UnpairedRename {
                            side: RenameSide::To,
                            name,
                        }),
                    },
                }
            } else if is_invalid_rename(line) {
                invalid.push(js_trim(line).to_string());
            }
        }
        if let Some(old) = pending.take() {
            unpaired.push(UnpairedRename {
                side: RenameSide::From,
                name: old,
            });
        }
    }
    (renamed, invalid, unpaired)
}

/// Parses a delta spec into its purpose and four operations.
///
/// Implements: rust-specs/delta-specs
#[must_use]
pub fn parse_delta(text: &str) -> Delta {
    let normalized = normalize_document(text);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mask = super::text::fence_mask(&lines);
    let sections = split_sections(&lines, &mask);
    let (renamed, invalid_renames, unpaired_renames) = renamed_in(&sections);

    Delta {
        title: delta_title(&lines, &mask),
        purpose: super::living::purpose_of(&lines, &mask),
        added: requirements_in(&sections, "ADDED Requirements"),
        modified: requirements_in(&sections, "MODIFIED Requirements"),
        removed: removed_in(&sections),
        renamed,
        invalid_renames,
        unpaired_renames,
    }
}
