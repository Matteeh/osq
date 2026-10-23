//! Resolving scope entries and the paths a verify command names.

use std::fs;
use std::path::Path;

use osq_kernel_loop::scope_files;
use osq_kernel_specs::{js_trim, scope_covers_path};

/// The glob characters that mark a scope entry as a pattern.
const GLOB_CHARACTERS: [char; 2] = ['*', '?'];

/// The project-relative paths a task's scope resolves to, as TypeScript does.
pub(super) fn resolved(root: &Path, scope: &[String]) -> Vec<String> {
    scope_files(root, scope)
        .into_iter()
        .filter(|path| !is_pattern(path) || root.join(path).is_file())
        .collect()
}

/// True when a normalized scope entry is a pattern or a trailing directory.
fn is_pattern(entry: &str) -> bool {
    entry.contains(GLOB_CHARACTERS) || entry.ends_with('/')
}

/// Normalizes a scope entry or named path: trimmed, POSIX, no leading `./`.
fn normalize(value: &str) -> String {
    js_trim(value)
        .replace('\\', "/")
        .trim_start_matches("./")
        .to_string()
}

/// The named paths a verify command would not find under `root`, in command order.
pub(super) fn missing_named(root: &Path, command: &str) -> Vec<String> {
    let mut missing = Vec::new();
    let mut seen = Vec::new();
    for named in named_paths(command) {
        if seen.contains(&named) {
            continue;
        }
        seen.push(named.clone());
        if is_missing(root, &named) {
            missing.push(named);
        }
    }
    missing
}

/// Whether one named path is absent from the project.
fn is_missing(root: &Path, named: &str) -> bool {
    if named.contains(GLOB_CHARACTERS) {
        resolved(root, std::slice::from_ref(&named.to_owned())).is_empty()
    } else {
        fs::metadata(root.join(named)).is_err()
    }
}

/// True when a declared scope covers one named path as TypeScript's rule says.
pub(super) fn covers_named(scope: &[String], named: &str) -> bool {
    if named.contains(GLOB_CHARACTERS) {
        let target = normalize(named);
        return scope.iter().any(|entry| normalize(entry) == target);
    }
    scope_covers_path(scope, named)
}

/// The path operands a verify command names, in command order.
fn named_paths(command: &str) -> Vec<String> {
    tokenize(command)
        .into_iter()
        .filter(|token| is_named_operand(token))
        .collect()
}

/// Whether one token is a named path operand.
fn is_named_operand(token: &str) -> bool {
    if token.is_empty() || token.starts_with('-') || token.starts_with('/') {
        return false;
    }
    if token.contains('=') || is_url(token) {
        return false;
    }
    token.contains('/') || token.contains('\\')
}

/// Whether a token begins with a URL scheme.
fn is_url(token: &str) -> bool {
    let bytes = token.as_bytes();
    if !bytes.first().is_some_and(u8::is_ascii_alphabetic) {
        return false;
    }
    let mut index = 1;
    while index < bytes.len()
        && (bytes[index].is_ascii_alphanumeric() || matches!(bytes[index], b'+' | b'.' | b'-'))
    {
        index = index.saturating_add(1);
    }
    token
        .get(index..)
        .is_some_and(|rest| rest.starts_with("://"))
}

/// Splits a command into tokens, honoring quotes and dropping the quotes.
fn tokenize(command: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut has_content = false;
    for character in command.chars() {
        if let Some(open) = quote {
            if character == open {
                quote = None;
            } else {
                current.push(character);
            }
            continue;
        }
        if matches!(character, '"' | '\'') {
            quote = Some(character);
            has_content = true;
            continue;
        }
        if character.is_whitespace() {
            if has_content {
                tokens.push(std::mem::take(&mut current));
                has_content = false;
            }
            continue;
        }
        current.push(character);
        has_content = true;
    }
    if has_content {
        tokens.push(current);
    }
    tokens
}
