//! Ticking the archived `tasks.md` checkboxes.

use std::fs;
use std::io;
use std::path::Path;

/// The file name whose checkboxes are ticked.
const TASKS: &str = "tasks.md";

/// The characters JavaScript's multiline `^` treats as line starts.
const LINE_TERMINATORS: [char; 4] = ['\n', '\r', '\u{2028}', '\u{2029}'];

/// Ticks the checkboxes of `folder`'s root `tasks.md`, when it has one.
///
/// # Errors
///
/// Returns the operating system's error when the `tasks.md` cannot be read or
/// written.
///
/// Implements: rust-archive/archive-task-checkboxes
pub(crate) fn folder(folder: &Path) -> io::Result<()> {
    let path = folder.join(TASKS);
    if !path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&path)?;
    let ticked = tick_text(&content);
    if ticked == content {
        return Ok(());
    }
    fs::write(&path, ticked)
}

/// Ticks every checkbox that starts a line, leaving the rest of the text alone.
fn tick_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut copied = 0;
    let mut at_line_start = true;
    for (index, character) in text.char_indices() {
        if at_line_start {
            if let Some(space) = checkbox(text, index) {
                out.push_str(&text[copied..space]);
                out.push('x');
                copied = space + 1;
            }
            at_line_start = false;
        }
        if is_line_terminator(character) {
            at_line_start = true;
        }
    }
    out.push_str(&text[copied..]);
    out
}

/// The byte index of the space inside a line-starting `[ ]`, when one starts here.
fn checkbox(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = skip_spaces(bytes, start);
    match bytes.get(index) {
        Some(b'-') => index += 1,
        _ => return None,
    }
    let run_start = index;
    index = skip_spaces(bytes, index);
    if index == run_start {
        return None;
    }
    if bytes.get(index..index + 3)? == b"[ ]" {
        Some(index + 1)
    } else {
        None
    }
}

/// The index after a run of spaces and tabs that starts at `from`.
fn skip_spaces(bytes: &[u8], from: usize) -> usize {
    let run = bytes[from..]
        .iter()
        .take_while(|byte| matches!(byte, b' ' | b'\t'))
        .count();
    from + run
}

/// Whether a character starts a new line for JavaScript's multiline `^`.
fn is_line_terminator(character: char) -> bool {
    LINE_TERMINATORS.contains(&character)
}
