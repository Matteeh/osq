//! Ticking the archived `tasks.md` checkboxes.

use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::Path;

/// Entries the tick walk never enters, as `tickAllTaskCheckboxes` skips them.
const SKIPPED: [&str; 3] = [".run", ".git", ".DS_Store"];

/// The file name whose checkboxes are ticked.
const TASKS: &str = "tasks.md";

/// The characters JavaScript's multiline `^` treats as line starts.
const LINE_TERMINATORS: [char; 4] = ['\n', '\r', '\u{2028}', '\u{2029}'];

/// Ticks every `tasks.md` under `folder`, skipping `.run`, `.git` and `.DS_Store`.
///
/// # Errors
///
/// Returns the operating system's error when a `tasks.md` cannot be read or
/// written.
///
/// Implements: rust-archive/archive-task-checkboxes
pub(crate) fn folder(folder: &Path) -> io::Result<()> {
    let mut stack = vec![folder.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            if is_skipped(&entry.file_name()) {
                continue;
            }
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if kind.is_dir() {
                stack.push(path);
            } else if kind.is_file() && entry.file_name() == OsStr::new(TASKS) {
                tick_file(&path)?;
            }
        }
    }
    Ok(())
}

/// Whether an entry's name is one the walk skips at any depth.
fn is_skipped(name: &OsStr) -> bool {
    SKIPPED.iter().any(|skipped| name == OsStr::new(*skipped))
}

/// Ticks one file's checkboxes, writing it only when its text changes.
fn tick_file(path: &Path) -> io::Result<()> {
    let content = fs::read_to_string(path)?;
    let ticked = tick_text(&content);
    if ticked == content {
        return Ok(());
    }
    fs::write(path, ticked)
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
        Some(b'-' | b'*') => index += 1,
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
