//! Making an absolute tool path relative to the project root.

/// Returns the project-relative form of a tool path.
pub(super) fn project_relative(target: &str, root: &str) -> String {
    if !target.starts_with('/') {
        return target.to_owned();
    }
    let from = absolute_segments(root);
    let to = absolute_segments(target);
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();
    let mut parts: Vec<&str> = Vec::new();
    parts.extend(std::iter::repeat_n("..", from.len() - common));
    for segment in &to[common..] {
        parts.push(segment);
    }
    parts.join("/")
}

/// Splits an absolute path into its normalized folders.
fn absolute_segments(path: &str) -> Vec<String> {
    let mut segments: Vec<String> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            other => segments.push(other.to_owned()),
        }
    }
    segments
}
