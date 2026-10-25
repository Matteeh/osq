//! The path rules the refusals and the selection share.

use osq_kernel_vcs::StatusEntry;

/// The changes folder relative to the project root.
pub(crate) const CHANGES: &str = "openspec/changes";

/// A path under the changes folder, so the prefix the comparison needs.
const CHANGES_PREFIX: &str = "openspec/changes/";

/// Turns every backslash into a forward slash, as TypeScript's `toPosix` does.
fn to_posix(value: &str) -> String {
    value.replace('\\', "/")
}

/// Resolves `.` and `..` segments and drops empty ones, as `path.posix.normalize`
/// does before TypeScript removes a trailing slash.
pub(crate) fn normalize(value: &str) -> String {
    let posix = to_posix(value);
    let absolute = posix.starts_with('/');
    let mut segments: Vec<&str> = Vec::new();
    for segment in posix.split('/') {
        match segment {
            "" | "." => {}
            ".." => match segments.last() {
                Some(last) if *last != ".." => {
                    segments.pop();
                }
                _ if !absolute => segments.push(".."),
                _ => {}
            },
            other => segments.push(other),
        }
    }
    let joined = segments.join("/");
    let normalized = if absolute {
        format!("/{joined}")
    } else if joined.is_empty() {
        ".".to_owned()
    } else {
        joined
    };
    normalized.trim_end_matches('/').to_owned()
}

/// Whether `candidate` is the changes folder or lies under it.
pub(crate) fn is_under_changes(candidate: &str) -> bool {
    let normalized = normalize(candidate);
    normalized == CHANGES || normalized.starts_with(CHANGES_PREFIX)
}

/// The first named path that belongs to a change, or `None`.
pub(crate) fn refused_named_path(named: &[String]) -> Option<String> {
    named
        .iter()
        .find(|path| is_under_changes(path))
        .map(|path| format!("{path} belongs to a change; osq manual keeps edits outside {CHANGES}"))
}

/// Whether a named path names an entry exactly or as a folder prefix.
pub(crate) fn names_entry(named: &str, entry: &StatusEntry) -> bool {
    let target = normalize(named);
    entry.path == target || entry.path.starts_with(&format!("{target}/"))
}

/// The entries a keep would touch: the named ones, or every non-untracked one.
pub(crate) fn select_entries(status: &[StatusEntry], named: &[String]) -> Vec<StatusEntry> {
    if named.is_empty() {
        return status
            .iter()
            .filter(|entry| entry.code != "??")
            .cloned()
            .collect();
    }
    status
        .iter()
        .filter(|entry| named.iter().any(|candidate| names_entry(candidate, entry)))
        .cloned()
        .collect()
}
