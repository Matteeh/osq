//! TypeScript's banned word rule: the texts of task files and delta specs that
//! hold a banned word inside a scope the ban covers.

use std::cmp::Ordering;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use osq_core::scope_covers_path;
use osq_kernel_config::BannedWord;
use osq_kernel_specs::parse_task_file;

use super::finding::{Finding, Severity};

/// The change folders below the project's openspec folder.
const OPENSPEC: &str = "openspec";
/// The changes folder below the openspec folder.
const CHANGES: &str = "changes";
/// The task files folder below a change folder.
const TASKS: &str = "tasks";
/// The delta specs folder below a change folder.
const SPECS: &str = "specs";
/// The file that holds one capability's delta spec.
const SPEC_FILE: &str = "spec.md";

/// Every banned word finding for one change, in task order then capability order.
pub(crate) fn findings(change: &Path, folder: &str, bans: &[BannedWord]) -> Vec<Finding> {
    if bans.is_empty() {
        return Vec::new();
    }
    let indexed: Vec<(usize, &BannedWord)> = bans.iter().enumerate().collect();
    let mut findings = Vec::new();
    let mut any_checked = false;
    for name in task_files(change) {
        let Some(content) = read_utf8(&change.join(TASKS).join(&name)) else {
            continue;
        };
        let Ok(task) = parse_task_file(&content) else {
            continue;
        };
        let matching: Vec<(usize, &BannedWord)> = indexed
            .iter()
            .filter(|(_, entry)| scope_overlaps(&task.scope, entry))
            .copied()
            .collect();
        if matching.is_empty() {
            continue;
        }
        any_checked = true;
        let file = format!("{OPENSPEC}/{CHANGES}/{folder}/{TASKS}/{name}");
        add_texts(&mut findings, &content, &file, &matching);
    }
    if !any_checked {
        return findings;
    }
    for capability in capabilities(change) {
        let spec = change.join(SPECS).join(&capability).join(SPEC_FILE);
        let Some(content) = read_utf8(&spec) else {
            continue;
        };
        let file = format!("{OPENSPEC}/{CHANGES}/{folder}/{SPECS}/{capability}/{SPEC_FILE}");
        add_texts(&mut findings, &content, &file, &indexed);
    }
    findings
}

/// Adds one warning per distinct text per entry that the text holds.
fn add_texts(
    findings: &mut Vec<Finding>,
    content: &str,
    file: &str,
    bans: &[(usize, &BannedWord)],
) {
    for text in scan_texts(content) {
        for &(index, entry) in bans {
            if !text_holds_word(&text, entry) {
                continue;
            }
            findings.push(Finding::new(
                Severity::Warning,
                file,
                None,
                format!(
                    "Banned word \"{}\" in \"{text}\": bannedWords[{index}] bans it in {}; name \
                     it another way",
                    entry.word,
                    entry.paths.join(", ")
                ),
            ));
        }
    }
}

/// The change's task file names, in numeric-aware name order.
fn task_files(change: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(change.join(TASKS)) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.as_bytes().ends_with(b".md"))
        .collect();
    names.sort_by(|left, right| task_order(left, right));
    names
}

/// Orders two task file names by their leading numbers, then by name.
fn task_order(left: &str, right: &str) -> Ordering {
    match (leading_digits(left), leading_digits(right)) {
        (Some(left_number), Some(right_number)) => match numeric_order(left_number, right_number) {
            Ordering::Equal => left.cmp(right),
            other => other,
        },
        _ => left.cmp(right),
    }
}

/// The leading ASCII digits of a file name.
fn leading_digits(name: &str) -> Option<&str> {
    let end = name
        .find(|character: char| !character.is_ascii_digit())
        .unwrap_or(name.len());
    if end == 0 { None } else { Some(&name[..end]) }
}

/// Orders two digit strings by numeric value without parsing them.
fn numeric_order(left: &str, right: &str) -> Ordering {
    let left = left.trim_start_matches('0');
    let right = right.trim_start_matches('0');
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

/// The names of the folders directly under the change's `specs`, in byte order.
fn capabilities(change: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(change.join(SPECS)) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// Reads a file as UTF-8 text, or none when it cannot be read or is not UTF-8.
fn read_utf8(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    String::from_utf8(bytes).ok()
}

/// True when an entry path and a task scope entry cover each other.
fn scope_overlaps(scope: &[String], entry: &BannedWord) -> bool {
    if entry
        .paths
        .iter()
        .any(|path| scope_covers_path(scope, path))
    {
        return true;
    }
    scope
        .iter()
        .any(|scope_entry| scope_covers_path(&entry.paths, scope_entry))
}

/// True when any whitespace token of the text holds the entry's word.
fn text_holds_word(text: &str, entry: &BannedWord) -> bool {
    let word = entry.word.to_lowercase();
    text.split(is_space)
        .filter(|token| !token.is_empty())
        .any(|token| token_holds_word(token, &word, &entry.paths))
}

/// True when one token holds `word`, unless its slash path is outside `paths`.
fn token_holds_word(token: &str, word: &str, paths: &[String]) -> bool {
    if !token.to_lowercase().contains(word) {
        return false;
    }
    if !token.contains('/') {
        return true;
    }
    scope_covers_path(paths, token)
}

/// Every banned-word text of a file, in file order, each text kept once.
fn scan_texts(content: &str) -> Vec<String> {
    let mut texts = Vec::new();
    let mut seen = HashSet::new();
    let mut in_fence = false;
    let mut in_scenario = false;
    for line in content.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if is_fence(line) {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            let text = trim_space(line);
            if !text.is_empty() {
                add_text(&mut texts, &mut seen, text);
            }
            continue;
        }
        if is_heading(line) {
            in_scenario = is_scenario_heading(line);
            continue;
        }
        let mut found = code_spans(line);
        if in_scenario {
            found.extend(quoted_texts(line));
        }
        found.sort_by_key(|(index, _)| *index);
        for (_, text) in found {
            add_text(&mut texts, &mut seen, &text);
        }
    }
    texts
}

/// Adds one text unless it is empty or an equal earlier text already added it.
fn add_text(texts: &mut Vec<String>, seen: &mut HashSet<String>, text: &str) {
    if seen.insert(text.to_owned()) {
        texts.push(text.to_owned());
    }
}

/// True when a line opens or closes a fenced block.
fn is_fence(line: &str) -> bool {
    let rest = line.trim_start_matches(is_space);
    rest.starts_with("```") || rest.starts_with("~~~")
}

/// True when a line is a Markdown heading of one to six hashes.
fn is_heading(line: &str) -> bool {
    let hashes = line
        .chars()
        .take_while(|character| *character == '#')
        .count();
    if !(1..=6).contains(&hashes) {
        return false;
    }
    line[hashes..].chars().next().is_some_and(is_space)
}

/// True when a heading starts a scenario: four hashes, whitespace and `Scenario:`.
fn is_scenario_heading(line: &str) -> bool {
    let Some(rest) = line.strip_prefix("####") else {
        return false;
    };
    let mut characters = rest.chars();
    if !characters.next().is_some_and(is_space) {
        return false;
    }
    trim_space(rest).starts_with("Scenario:")
}

/// The inline code spans of a line, each with its opening backtick's offset.
fn code_spans(line: &str) -> Vec<(usize, String)> {
    let mut spans = Vec::new();
    let mut open: Option<usize> = None;
    for (index, _) in line.match_indices('`') {
        match open {
            Some(start) if index > start + 1 => {
                spans.push((start, line[start + 1..index].to_owned()));
                open = None;
            }
            Some(_) | None => open = Some(index),
        }
    }
    spans
}

/// The double-quoted texts of a line, each with its opening quote's offset.
fn quoted_texts(line: &str) -> Vec<(usize, String)> {
    let mut texts = Vec::new();
    let mut open: Option<usize> = None;
    for (index, _) in line.match_indices('"') {
        match open {
            Some(start) => {
                texts.push((start, line[start + 1..index].to_owned()));
                open = None;
            }
            None => open = Some(index),
        }
    }
    texts
}

/// True for JavaScript whitespace, which includes the byte order mark.
fn is_space(character: char) -> bool {
    character.is_whitespace() || character == '\u{feff}'
}

/// Trims JavaScript whitespace from both ends.
fn trim_space(text: &str) -> &str {
    text.trim_matches(is_space)
}
