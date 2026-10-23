//! The output tail and marker excerpt a run's verifies keep.

/// A line whose text, after leading whitespace, opens the failing-tests section.
const FAILING_TESTS_PREFIX: &str = "✖ failing tests:";

/// The recorded output, trimmed to the event's line and character limits.
///
/// Implements: rust-run/run-verdict
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
    kept(&lines[start..], max_chars)
}

/// The excerpt a dead marker keeps of a command's output and its log.
///
/// Implements: rust-run/run-verdict
pub(crate) fn excerpt_verify_output(
    output: &str,
    source: &str,
    max_lines: u64,
    max_chars: u64,
) -> String {
    let full_output = format!("Full output: {source}");
    let trimmed = output.trim_end();
    if trimmed.is_empty() {
        return format!("(no output)\n{full_output}");
    }
    let lines: Vec<&str> = trimmed.split('\n').collect();
    let max_lines = usize::try_from(max_lines).unwrap_or(usize::MAX);
    let max_chars = usize::try_from(max_chars).unwrap_or(usize::MAX);
    let mut start = lines.len().saturating_sub(max_lines);
    for (index, line) in lines.iter().enumerate().rev() {
        if line.trim_start().starts_with(FAILING_TESTS_PREFIX) {
            start = index;
            break;
        }
    }
    format!("{}\n{full_output}", kept(&lines[start..], max_chars))
}

/// Joins lines, each cut to `max_chars`, with newlines.
///
/// Implements: rust-run/run-verdict
fn kept(lines: &[&str], max_chars: usize) -> String {
    lines
        .iter()
        .map(|line| cut(line, max_chars))
        .collect::<Vec<_>>()
        .join("\n")
}

/// The number of characters in one line.
///
/// Implements: rust-run/run-verdict
fn length(line: &str) -> usize {
    line.chars().count()
}

/// Keeps the first `max_chars` characters and counts the rest after them.
///
/// Implements: rust-run/run-verdict
fn cut(line: &str, max_chars: usize) -> String {
    if length(line) <= max_chars {
        return line.to_owned();
    }
    let kept: String = line.chars().take(max_chars).collect();
    let rest = length(line) - max_chars;
    format!("{kept}… ({rest} more characters)")
}
