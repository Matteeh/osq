//! The path operands a verify command names, and whether they exist.

use std::fs;
use std::path::Path;

use osq_kernel_loop::scope_files;

/// The glob characters that make a named path a pattern.
const GLOB_CHARACTERS: [char; 2] = ['*', '?'];

/// The path operands a verify command names, in command order.
///
/// Implements: rust-run/pre-spawn-verify
pub(crate) fn list(command: &str) -> Vec<String> {
    tokenize(command)
        .into_iter()
        .filter(|token| names_path(token))
        .collect()
}

/// The named paths a verify command does not find under the root.
///
/// Implements: rust-run/pre-spawn-verify
pub(crate) fn missing(root: &Path, command: &str) -> Vec<String> {
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
///
/// Implements: rust-run/pre-spawn-verify
fn exists(root: &Path, named: &str) -> bool {
    if named.contains(GLOB_CHARACTERS) {
        return scope_files(root, &[named.to_owned()])
            .iter()
            .any(|path| regular_file(root, path));
    }
    fs::metadata(root.join(named)).is_ok()
}

/// True when a project-relative path names an existing regular file.
///
/// Implements: rust-run/pre-spawn-verify
fn regular_file(root: &Path, path: &str) -> bool {
    root.join(path)
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_file())
}

/// Splits a command at whitespace outside quotes, dropping the quote characters.
///
/// Implements: rust-run/pre-spawn-verify
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
///
/// Implements: rust-run/pre-spawn-verify
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
///
/// Implements: rust-run/pre-spawn-verify
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
///
/// Implements: rust-run/pre-spawn-verify
fn is_space(character: char) -> bool {
    character.is_whitespace() || character == '\u{feff}'
}
