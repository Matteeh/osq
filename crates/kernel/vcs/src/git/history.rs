//! Each history read's git arguments and its pure parser.

use crate::VcsError;
use crate::port::DiffStat;

use super::GitVcs;

/// The byte git prints between commits in the trailer log format.
const RECORD_SEPARATOR: char = '\u{1e}';

/// The byte git prints between one commit's trailer values.
const UNIT_SEPARATOR: char = '\u{1f}';

/// The trimmed, non-empty form of `text`, or none.
fn non_empty(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_owned())
    }
}

/// One numstat field as a line count, `-` counting as 0.
fn line_count(field: &str) -> Option<u64> {
    if field == "-" {
        Some(0)
    } else {
        field.parse().ok()
    }
}

/// Parses `diff --numstat --no-renames` output into its totals.
fn parse_diff_stat(output: &str) -> DiffStat {
    let mut stat = DiffStat {
        files: 0,
        added: 0,
        removed: 0,
    };
    for line in output.lines() {
        let mut fields = line.split('\t');
        let added = fields.next().and_then(line_count);
        let removed = fields.next().and_then(line_count);
        if let (Some(added), Some(removed)) = (added, removed) {
            stat.files += 1;
            stat.added += added;
            stat.removed += removed;
        }
    }
    stat
}

/// Parses the trailer log output into its trimmed, non-empty values.
fn parse_trailers(output: &str) -> Vec<String> {
    output
        .split(RECORD_SEPARATOR)
        .flat_map(|record| record.split(UNIT_SEPARATOR))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Parses `rev-list --count` output, falling back to 0.
fn parse_count(output: &str) -> u64 {
    output.trim().parse().unwrap_or(0)
}

/// Reads the merge base of two revs.
pub(super) fn merge_base(vcs: &GitVcs, a: &str, b: &str) -> Result<Option<String>, VcsError> {
    let output = vcs.read(&["merge-base", a, b])?;
    Ok(output.as_deref().and_then(non_empty))
}

/// Reads whether one rev is an ancestor of another.
pub(super) fn is_ancestor(
    vcs: &GitVcs,
    ancestor: &str,
    descendant: &str,
) -> Result<bool, VcsError> {
    Ok(vcs
        .read(&["merge-base", "--is-ancestor", ancestor, descendant])?
        .is_some())
}

/// Reads how many commits one rev has that another lacks.
pub(super) fn count_commits(vcs: &GitVcs, from: &str, to: &str) -> Result<u64, VcsError> {
    let range = format!("{from}..{to}");
    let output = vcs.read(&["rev-list", "--count", &range])?;
    Ok(output.as_deref().map_or(0, parse_count))
}

/// Reads what one rev changed since its merge base with another.
pub(super) fn diff_stat(
    vcs: &GitVcs,
    from: &str,
    to: &str,
    exclude: &[&str],
) -> Result<Option<DiffStat>, VcsError> {
    let range = format!("{from}...{to}");
    let pathspecs: Vec<String> = exclude
        .iter()
        .map(|entry| format!(":(exclude){entry}"))
        .collect();
    let mut args = vec!["diff", "--numstat", "--no-renames", &range, "--", "."];
    args.extend(pathspecs.iter().map(String::as_str));
    let output = vcs.read(&args)?;
    Ok(output.as_deref().map(parse_diff_stat))
}

/// Reads the trailer values on the commits one rev has that another lacks.
pub(super) fn trailer_values(
    vcs: &GitVcs,
    from: &str,
    to: &str,
    key: &str,
) -> Result<Vec<String>, VcsError> {
    let format = format!("--format=%x1e%(trailers:key={key},valueonly,separator=%x1f)");
    let range = format!("{from}..{to}");
    let output = vcs.read(&["log", &format, &range])?;
    Ok(output.as_deref().map(parse_trailers).unwrap_or_default())
}
