//! Parsing of Code ownership globs from a requirement block.

use super::text::{is_js_whitespace, js_trim, normalize_line_endings, strip_prefix_ci};
use std::collections::HashSet;

/// True for a `### Requirement: Code ownership` header line, in any case.
fn is_code_ownership_header(line: &str) -> bool {
    let Some(rest) = line.strip_prefix("###") else {
        return false;
    };
    let Some(first) = rest.chars().next() else {
        return false;
    };
    if !is_js_whitespace(first) {
        return false;
    }
    let rest = rest.trim_start_matches(is_js_whitespace);
    let Some(rest) = strip_prefix_ci(rest, "Requirement:") else {
        return false;
    };
    let rest = rest.trim_start_matches(is_js_whitespace);
    js_trim(rest).eq_ignore_ascii_case("Code ownership")
}

/// True for a line that ends the ownership block: `###` or `##` plus whitespace.
fn is_boundary(line: &str) -> bool {
    if line
        .strip_prefix("###")
        .and_then(|rest| rest.chars().next())
        .is_some_and(is_js_whitespace)
    {
        return true;
    }
    line.strip_prefix("##")
        .and_then(|rest| rest.chars().next())
        .is_some_and(|c| c != '#' && is_js_whitespace(c))
}

/// The text of the first `<!-- source: ... -->` comment in the block.
fn source_comment(block: &str) -> Option<String> {
    let mut rest = block;
    while let Some((_, after)) = rest.split_once("<!--") {
        let after = after.trim_start_matches(is_js_whitespace);
        if let Some(after) = strip_prefix_ci(after, "source:") {
            let after = after.trim_start_matches(is_js_whitespace);
            if let Some(end) = after.find("-->") {
                return Some(after[..end].to_string());
            }
        }
        rest = after;
    }
    None
}

/// Splits a source comment into its trimmed, non-empty comma parts.
fn source_parts(comment: &str) -> Vec<String> {
    comment
        .split(',')
        .map(js_trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
}

/// The trimmed backtick tokens of the block that look like paths, once each.
fn quoted_tokens(block: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut seen = HashSet::new();
    let mut rest = block;
    while let Some((_, after_open)) = rest.split_once('`') {
        let Some((token, after_close)) = after_open.split_once('`') else {
            break;
        };
        if token.is_empty() {
            rest = after_open;
            continue;
        }
        let token = js_trim(token);
        let path_like = token.contains('/') || token.contains('\\') || token.contains('*');
        if path_like && seen.insert(token.to_string()) {
            tokens.push(token.to_string());
        }
        rest = after_close;
    }
    tokens
}

/// Reads the globs of the first Code ownership requirement, or none.
///
/// Implements: rust-specs/code-ownership-sources
#[must_use]
pub fn code_ownership(text: &str) -> Vec<String> {
    let normalized = normalize_line_endings(text);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let Some(start) = lines.iter().position(|line| is_code_ownership_header(line)) else {
        return Vec::new();
    };
    let end = (start.saturating_add(1)..lines.len())
        .find(|index| is_boundary(lines[*index]))
        .unwrap_or(lines.len());
    let block = lines[start.saturating_add(1)..end].join("\n");
    source_comment(&block).map_or_else(|| quoted_tokens(&block), |comment| source_parts(&comment))
}
