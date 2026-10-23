//! Pure leaves that map a verify run's status and output.

use std::path::Path;
use std::process::ExitStatus;

/// The characters that end a path when the folder stands alone in the output.
const BOUNDARY: &str = "\"'()[]{},;:";

/// Maps a timeout or a signal to 1 and a normal exit to its own code.
pub(super) fn exit_code(status: Option<ExitStatus>, timed_out: bool) -> i32 {
    if timed_out {
        return 1;
    }
    status.and_then(|status| status.code()).unwrap_or(1)
}

/// Removes the command's folder from its output and turns a lone folder into `.`.
pub(super) fn relativize(cwd: &Path, output: &str) -> String {
    let folder = cwd.to_string_lossy();
    let folder = folder.trim_end_matches(['/', '\\']);
    if folder.is_empty() {
        return output.to_owned();
    }
    let mut result = String::with_capacity(output.len());
    let mut rest = output;
    while let Some(index) = rest.find(folder) {
        result.push_str(&rest[..index]);
        rest = &rest[index + folder.len()..];
        if let Some(tail) = rest.strip_prefix('/') {
            rest = tail;
        } else if ends_a_path(rest.chars().next()) {
            result.push('.');
        } else {
            result.push_str(folder);
        }
    }
    result.push_str(rest);
    result
}

/// Whether the character after a folder is none, whitespace or punctuation.
fn ends_a_path(next: Option<char>) -> bool {
    match next {
        None => true,
        Some(character) => character.is_whitespace() || BOUNDARY.contains(character),
    }
}
