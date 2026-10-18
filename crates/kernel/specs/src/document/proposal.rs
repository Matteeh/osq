//! Parsing of `proposal.md` frontmatter and body sections.

use super::frontmatter::parse_frontmatter;
use super::types::{Proposal, SyntaxError};
use super::yaml::{change_ids, reads_field, text_field};
use crate::markdown::section;
use crate::markdown::text::is_js_whitespace;

/// Parses a proposal into its fields and body sections.
///
/// # Errors
///
/// Returns a `SyntaxError` when the proposal's frontmatter does not parse.
///
/// Implements: rust-specs/proposals
pub fn parse_proposal(text: &str) -> Result<Proposal, SyntaxError> {
    let frontmatter = parse_frontmatter(text)?;
    let contract = section(&frontmatter.body, "Contract");
    Ok(Proposal {
        title: text_field(&frontmatter.data, "title"),
        depends_on: change_ids(&frontmatter.data, "depends_on"),
        fixes: change_ids(&frontmatter.data, "fixes"),
        reads: reads_field(&frontmatter.data),
        goal: section(&frontmatter.body, "Goal"),
        contract_tables: count_contract_tables(&contract),
        contract,
        non_goals: section(&frontmatter.body, "Non-goals"),
        delta: section(&frontmatter.body, "Delta"),
        verify: text_field(&frontmatter.data, "verify"),
    })
}

/// Counts the Markdown tables of a contract section, as TypeScript's pattern does.
fn count_contract_tables(text: &str) -> usize {
    let positions: Vec<usize> = text.match_indices('|').map(|(index, _)| index).collect();
    let mut count = 0;
    let mut skip_until = 0;
    for start in positions {
        if start < skip_until {
            continue;
        }
        if let Some(end) = table_end(text, start) {
            count += 1;
            skip_until = end;
        }
    }
    count
}

/// The end of a table starting at `start`, if the pattern matches there.
fn table_end(text: &str, start: usize) -> Option<usize> {
    let (header, after_header) = line_at(text, start)?;
    if pipe_middle(header)?.is_empty() {
        return None;
    }
    let (alignment, after_alignment) = line_at(text, after_header)?;
    let cells = pipe_middle(alignment)?;
    if cells.is_empty() || !cells.chars().all(is_alignment_char) {
        return None;
    }
    let mut offset = after_alignment;
    let mut has_rows = false;
    for _ in 0..text.len() {
        let Some(next) = row_end(text, offset) else {
            break;
        };
        offset = next;
        has_rows = true;
    }
    if !has_rows {
        return None;
    }
    Some(offset)
}

/// The content of the line at `start` without its break, and the offset after it.
fn line_at(text: &str, start: usize) -> Option<(&str, usize)> {
    let rest = &text[start..];
    let newline = rest.find('\n')?;
    let ending = rest[..newline]
        .strip_suffix('\r')
        .unwrap_or(&rest[..newline]);
    Some((ending, start + newline + 1))
}

/// The text between the outer pipes of a line, or `None` without both.
fn pipe_middle(line: &str) -> Option<&str> {
    line.strip_prefix('|')?.strip_suffix('|')
}

/// True for a character the alignment row's pattern accepts.
fn is_alignment_char(character: char) -> bool {
    matches!(character, '-' | ':' | '|') || is_js_whitespace(character)
}

/// The end of one table row starting at `start`, after its optional line break.
fn row_end(text: &str, start: usize) -> Option<usize> {
    let rest = &text[start..];
    let line_end = rest.find('\n').unwrap_or(rest.len());
    let content = &rest[..line_end];
    let last = content.rfind('|')?;
    if last < 2 {
        return None;
    }
    Some(consume_break(text, start + last + 1))
}

/// Advances past the `\r?\n?` a row pattern allows.
fn consume_break(text: &str, after: usize) -> usize {
    let rest = &text[after..];
    if rest.starts_with("\r\n") {
        after + 2
    } else if rest.starts_with('\n') || rest.starts_with('\r') {
        after + 1
    } else {
        after
    }
}
