//! Reading the active failure markers and the reason a retry carries.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::FailureReason;
use osq_kernel_specs::parse_frontmatter;

use super::args::CHANGE;
use super::text;

/// The active failure facts one retry needs after every refusal passed.
pub(crate) struct Failure {
    /// The reason the highest-precedence active marker gives.
    pub(crate) reason: FailureReason,
    /// One more than the highest retained attempt, shared by both markers.
    pub(crate) ordinal: u64,
    /// Whether `.run/dead/<target>.md` is active.
    pub(crate) has_dead: bool,
    /// Whether `.run/regressed/<target>.md` is active.
    pub(crate) has_regressed: bool,
}

/// Reads the active markers, their reason and the next retained ordinal.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when neither marker is
/// active, when a marker cannot be read, or when its reason is not one osq
/// knows.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn read(
    folder: &Path,
    folder_name: &str,
    target: &str,
) -> Result<Failure, FeatureError> {
    let run = folder.join(".run");
    let dead_dir = run.join("dead");
    let regressed_dir = run.join("regressed");
    let dead_entries = entries(&dead_dir);
    let regressed_entries = entries(&regressed_dir);
    let dead_path = dead_dir.join(format!("{target}.md"));
    let regressed_path = regressed_dir.join(format!("{target}.md"));
    let has_dead = target != CHANGE && dead_path.exists();
    let has_regressed = regressed_path.exists();
    if !has_dead && !has_regressed {
        return Err(text::no_marker(target, folder_name));
    }
    let (path, fallback) = if has_regressed {
        (regressed_path, "regressed")
    } else {
        (dead_path, "dead")
    };
    let reason_text = marker_reason(&path, fallback)?;
    let reason = FailureReason::ALL
        .iter()
        .copied()
        .find(|reason| reason.as_str() == reason_text)
        .ok_or_else(|| text::unknown_reason(&reason_text))?;
    let ordinal = retained_ordinal(&dead_entries, target)
        .max(retained_ordinal(&regressed_entries, target))
        + 1;
    Ok(Failure {
        reason,
        ordinal,
        has_dead,
        has_regressed,
    })
}

/// The done marker facts a recertification needs.
pub(crate) struct Recertified {
    /// The scope hash the done marker recorded.
    pub(crate) recorded_hash: String,
}

/// Picks a task scope regression whose done marker records a scope hash.
///
/// Implements: rust-retry/scope-recertification
pub(crate) fn recertification(
    folder: &Path,
    target: &str,
    failure: &Failure,
) -> Option<Recertified> {
    let recertifiable = target != CHANGE
        && failure.has_regressed
        && !failure.has_dead
        && failure.reason == FailureReason::ScopeRegression;
    if !recertifiable {
        return None;
    }
    let done = folder.join(".run").join("done").join(target);
    let text = fs::read_to_string(done).ok()?;
    let recorded_hash = frontmatter_text(&text, "scope_hash")?;
    if recorded_hash.is_empty() {
        return None;
    }
    Some(Recertified { recorded_hash })
}

/// The reason text of one marker, or its fallback when it has none.
///
/// Implements: rust-retry/retry-refusals
fn marker_reason(path: &Path, fallback: &str) -> Result<String, FeatureError> {
    let text = fs::read_to_string(path)
        .map_err(|error| text::failed(format!("cannot read {}: {error}", path.display())))?;
    let reason = frontmatter_text(&text, "reason")
        .map(|reason| reason.trim().to_owned())
        .filter(|reason| !reason.is_empty())
        .unwrap_or_else(|| fallback.to_owned());
    Ok(reason)
}

/// A string frontmatter field, or none without one that parses.
///
/// Implements: rust-retry/retry-refusals
fn frontmatter_text(text: &str, key: &str) -> Option<String> {
    let frontmatter = parse_frontmatter(text).ok()?;
    frontmatter
        .data
        .iter()
        .find(|(name, _)| name.as_str() == Some(key))
        .and_then(|(_, value)| value.as_str())
        .map(str::to_owned)
}

/// The names directly under `dir`, or none without the folder.
///
/// Implements: rust-retry/retry-record
fn entries(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}

/// The highest `n` of `<target>.<n>.md` among `entries`, or zero.
///
/// Implements: rust-retry/retry-record
fn retained_ordinal(entries: &[String], target: &str) -> u64 {
    let prefix = format!("{target}.");
    entries
        .iter()
        .filter_map(|name| name.strip_prefix(&prefix))
        .filter_map(|rest| rest.strip_suffix(".md"))
        .filter(|digits| digits.bytes().all(|byte| byte.is_ascii_digit()))
        .filter_map(|digits| digits.parse().ok())
        .max()
        .unwrap_or(0)
}
