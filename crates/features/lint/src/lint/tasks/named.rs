//! The path operands a task's verify command names, and whether they exist.

use std::fs;
use std::path::Path;

use osq_core::scope_covers_path;
use osq_kernel_loop::scope_files;

use super::regular_file;

/// The glob characters that make a named path a pattern.
const GLOB_CHARACTERS: [char; 2] = ['*', '?'];

/// The path operands a verify command names, in command order.
pub(super) fn list(command: &str) -> Vec<String> {
    tokenize(command)
        .into_iter()
        .filter(|token| names_path(token))
        .collect()
}

/// The named paths a verify command does not find under the root.
pub(super) fn missing(root: &Path, command: &str) -> Vec<String> {
    let mut missing = Vec::new();
    let mut seen = Vec::new();
    for named in list(command) {
        if seen.contains(&named) {
            continue;
        }
        seen.push(named.clone());
        if !exists(root, &named) {
            missing.push(named);
        }
    }
    missing
}

/// True when one named path is present under the root.
fn exists(root: &Path, named: &str) -> bool {
    if named.contains(GLOB_CHARACTERS) {
        return scope_files(root, &[named.to_owned()])
            .iter()
            .any(|path| regular_file(root, path));
    }
    fs::metadata(root.join(named)).is_ok()
}

/// True when a scope covers one named path.
pub(super) fn covered(named: &str, scope: &[String]) -> bool {
    if named.contains(GLOB_CHARACTERS) {
        let target = normalize(named);
        return scope.iter().any(|entry| normalize(entry) == target);
    }
    scope_covers_path(scope, named)
}

/// True when any of the scopes covers one named path.
pub(super) fn covered_by(named: &str, scopes: &[Vec<String>]) -> bool {
    scopes.iter().any(|scope| covered(named, scope))
}

/// Trims and normalizes a path to the comparable POSIX form.
fn normalize(value: &str) -> String {
    js_trim(value)
        .replace('\\', "/")
        .trim_start_matches("./")
        .to_owned()
}

/// Splits a command at whitespace outside quotes, dropping the quote characters.
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
        if character == '"' || character == '\'' {
            quote = Some(character);
            has_content = true;
            continue;
        }
        if is_space(character) {
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

/// True when a token can name a repository path.
fn names_path(token: &str) -> bool {
    if token.is_empty() || token.starts_with('-') || token.starts_with('/') {
        return false;
    }
    if token.contains('=') || has_url_scheme(token) {
        return false;
    }
    token.contains('/') || token.contains('\\')
}

/// True when a token starts with a URL scheme.
fn has_url_scheme(token: &str) -> bool {
    let Some((scheme, _)) = token.split_once("://") else {
        return false;
    };
    let mut characters = scheme.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    first.is_ascii_alphabetic()
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '.' | '-')
        })
}

/// True for JavaScript whitespace, which includes the byte order mark.
fn is_space(character: char) -> bool {
    character.is_whitespace() || character == '\u{feff}'
}

/// Trims JavaScript whitespace from both ends.
fn js_trim(text: &str) -> &str {
    text.trim_matches(is_space)
}
