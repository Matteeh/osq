//! Parsing of a task file's frontmatter and acceptance lines.

use super::frontmatter::parse_frontmatter;
use super::types::{SyntaxError, TaskFile, VerifyStarts};
use super::yaml::{list_field, lookup, text_field};
use crate::markdown::section;
use crate::markdown::text::{is_js_whitespace, js_trim};
use yaml_rust2::yaml::{Hash, Yaml};

/// Parses a task file into its fields and its acceptance lines.
///
/// # Errors
///
/// Returns a `SyntaxError` when the task file's frontmatter does not parse.
///
/// Implements: rust-specs/task-files
pub fn parse_task_file(text: &str) -> Result<TaskFile, SyntaxError> {
    let frontmatter = parse_frontmatter(text)?;
    Ok(TaskFile {
        title: text_field(&frontmatter.data, "title"),
        verify: text_field(&frontmatter.data, "verify"),
        scope: list_field(&frontmatter.data, "scope"),
        entry: list_field(&frontmatter.data, "entry"),
        skills: list_field(&frontmatter.data, "skills"),
        tests_modify: tests_modify(&frontmatter.data),
        verify_starts: verify_starts(&frontmatter.data),
        acceptance: acceptance_lines(&frontmatter.body),
    })
}

/// Whether the task may change preexisting tests.
fn tests_modify(mapping: &Hash) -> bool {
    if let Some(Yaml::Hash(tests)) = lookup(mapping, "tests") {
        if let Some(Yaml::Boolean(flag)) = lookup(tests, "modify") {
            return *flag;
        }
    }
    matches!(lookup(mapping, "tests.modify"), Some(Yaml::Boolean(true)))
}

/// The declared state the task's verify starts in.
fn verify_starts(mapping: &Hash) -> VerifyStarts {
    match lookup(mapping, "verify_starts") {
        Some(Yaml::String(text)) if text == "green" => VerifyStarts::Green,
        Some(Yaml::String(text)) if text == "any" => VerifyStarts::Any,
        _ => VerifyStarts::Red,
    }
}

/// The body's acceptance lines, or the whole body without an Acceptance section.
fn acceptance_lines(body: &str) -> Vec<String> {
    let acceptance = section(body, "Acceptance");
    let source = if acceptance.is_empty() {
        body
    } else {
        acceptance.as_str()
    };
    source.split('\n').filter_map(acceptance_item).collect()
}

/// The trimmed text of one acceptance line, or `None` when it is not one.
fn acceptance_item(line: &str) -> Option<String> {
    let rest = line.strip_prefix('-').or_else(|| line.strip_prefix('*'))?;
    let rest = strip_whitespace(rest)?;
    let rest = rest.strip_prefix('[')?;
    match rest.chars().next() {
        Some(' ' | 'x' | 'X') => {}
        _ => return None,
    }
    let rest = rest[1..].strip_prefix(']')?;
    let rest = strip_whitespace(rest)?;
    Some(js_trim(rest).to_string())
}

/// Drops one or more leading JavaScript whitespace characters, if any.
fn strip_whitespace(text: &str) -> Option<&str> {
    match text.chars().next() {
        Some(character) if is_js_whitespace(character) => {
            Some(text.trim_start_matches(is_js_whitespace))
        }
        _ => None,
    }
}
