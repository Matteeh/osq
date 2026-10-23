//! The output tail a failed archive commit's record keeps, as `tailVerifyOutput` does.

/// The recorded output, trimmed to the marker's line and character limits.
///
/// Implements: rust-archive/worktree-archive
pub(crate) fn tail_verify_output(output: &str, max_lines: u64, max_chars: u64) -> String {
    let trimmed = output.trim_end();
    if trimmed.is_empty() {
        return String::new();
    }
    let lines: Vec<&str> = trimmed.split('\n').collect();
    let max_lines = usize::try_from(max_lines).unwrap_or(usize::MAX);
    let max_chars = usize::try_from(max_chars).unwrap_or(usize::MAX);
    let within = lines.len() <= max_lines && lines.iter().all(|line| length(line) <= max_chars);
    if within {
        return output.to_owned();
    }
    let start = lines.len().saturating_sub(max_lines);
    lines[start..]
        .iter()
        .map(|line| cut(line, max_chars))
        .collect::<Vec<_>>()
        .join("\n")
}

/// The number of characters in one line.
///
/// Implements: rust-archive/worktree-archive
fn length(line: &str) -> usize {
    line.chars().count()
}

/// Keeps the first `max_chars` characters and counts the rest after them.
///
/// Implements: rust-archive/worktree-archive
fn cut(line: &str, max_chars: usize) -> String {
    if length(line) <= max_chars {
        return line.to_owned();
    }
    let kept: String = line.chars().take(max_chars).collect();
    let rest = length(line) - max_chars;
    format!("{kept}… ({rest} more characters)")
}
