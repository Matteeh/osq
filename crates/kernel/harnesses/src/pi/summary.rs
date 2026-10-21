//! Tool summaries and the project-root stripping applied to them.

use serde_json::{Map, Value};

/// The longest summary kept before the project root is stripped.
const SUMMARY_MAX: usize = 60;

/// Builds the short summary pi's tool call gets.
pub(super) fn tool_summary(tool: &str, args: Option<&Map<String, Value>>) -> String {
    let raw = match tool {
        "bash" => field(args, "command").unwrap_or_default().to_owned(),
        "read" | "edit" | "write" => field(args, "path").unwrap_or_default().to_owned(),
        "grep" | "find" | "ls" => field(args, "pattern")
            .or_else(|| field(args, "path"))
            .unwrap_or_default()
            .to_owned(),
        _ => compact(args),
    };
    truncate(&raw)
}

/// Strips the project root from a tool summary.
pub(super) fn relativize(summary: &str, root: &str) -> String {
    let root = root.trim_end_matches(['/', '\\']);
    if root.is_empty() {
        return summary.to_owned();
    }
    let with_separator = summary
        .replace(&format!("{root}/"), "")
        .replace(&format!("{root}\\"), "");
    replace_exact_root(&with_separator, root)
}

/// Reads a non-empty string field from tool arguments.
fn field<'a>(args: Option<&'a Map<String, Value>>, key: &str) -> Option<&'a str> {
    args?.get(key)?.as_str().filter(|text| !text.is_empty())
}

/// Writes tool arguments as compact JSON, or `{}` when they are absent.
fn compact(args: Option<&Map<String, Value>>) -> String {
    match args {
        Some(args) => Value::Object(args.clone()).to_string(),
        None => "{}".to_owned(),
    }
}

/// Keeps the first [`SUMMARY_MAX`] characters of a summary.
fn truncate(summary: &str) -> String {
    summary.chars().take(SUMMARY_MAX).collect()
}

/// Replaces each whole occurrence of the root with `.`.
fn replace_exact_root(summary: &str, root: &str) -> String {
    let Some(_first) = root.chars().next() else {
        return summary.to_owned();
    };
    let mut out = String::with_capacity(summary.len());
    let mut rest = summary;
    while let Some(position) = rest.find(root) {
        out.push_str(&rest[..position]);
        let after = &rest[position + root.len()..];
        let boundary = after
            .chars()
            .next()
            .is_none_or(|next| next.is_whitespace() || "\"'()[]{},;:".contains(next));
        if boundary {
            out.push('.');
        } else {
            out.push_str(root);
        }
        rest = after;
    }
    out.push_str(rest);
    out
}
