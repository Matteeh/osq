//! Renaming the active markers into history and appending the retry event.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use osq_core::FeatureError;
use osq_core::event::{Envelope, Event, RetryData, event_line};

use super::args::CHANGE;
use super::marker::Failure;
use super::text;
use super::time;

/// Retains each active marker, appends the `retry` event and builds the text.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when a marker cannot be
/// renamed or the event folder or file cannot be written.
///
/// Implements: rust-retry/retry-record
pub(crate) fn record(
    folder: &Path,
    id: &str,
    target: &str,
    failure: &Failure,
) -> Result<String, FeatureError> {
    let run = folder.join(".run");
    let mut retained = Vec::new();
    if failure.has_regressed {
        retain(
            &run.join("regressed").join(format!("{target}.md")),
            &run.join("regressed")
                .join(format!("{target}.{}.md", failure.ordinal)),
            folder,
            &mut retained,
        )?;
    }
    if failure.has_dead {
        retain(
            &run.join("dead").join(format!("{target}.md")),
            &run.join("dead")
                .join(format!("{target}.{}.md", failure.ordinal)),
            folder,
            &mut retained,
        )?;
    }
    if target != CHANGE && failure.has_regressed {
        let done = run.join("done").join(target);
        if done.exists() {
            retain(
                &done,
                &run.join("done")
                    .join(format!("{target}.{}", failure.ordinal)),
                folder,
                &mut retained,
            )?;
        }
    }
    let attempt = failure.ordinal + 1;
    append_event(folder, target, failure.reason, attempt)?;
    Ok(text::retried(
        id,
        target,
        failure.reason.as_str(),
        attempt,
        &retained,
    ))
}

/// Renames one marker and records its path relative to the change folder.
///
/// Implements: rust-retry/retry-record
fn retain(
    from: &Path,
    to: &Path,
    folder: &Path,
    retained: &mut Vec<String>,
) -> Result<(), FeatureError> {
    fs::rename(from, to).map_err(|error| {
        text::failed(format!(
            "cannot rename {} to {}: {error}",
            from.display(),
            to.display()
        ))
    })?;
    retained.push(relative(folder, to));
    Ok(())
}

/// `path` relative to `folder`, with `/` separators.
///
/// Implements: rust-retry/retry-record
fn relative(folder: &Path, path: &Path) -> String {
    path.strip_prefix(folder)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Appends one `retry` event with the current time and no `automatic` key.
///
/// Implements: rust-retry/retry-record
fn append_event(
    folder: &Path,
    target: &str,
    reason: osq_core::event::FailureReason,
    attempt: u64,
) -> Result<(), FeatureError> {
    let dir = folder.join(".run").join("events");
    fs::create_dir_all(&dir).map_err(|error| write_error(&dir, &error))?;
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event: Event::Retry(RetryData {
            target: target.to_owned(),
            reason,
            attempt,
            automatic: None,
        }),
    };
    let path = dir.join(format!("{target}.jsonl"));
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
        .map_err(|error| write_error(&path, &error))?;
    file.write_all(format!("{}\n", event_line(&envelope)).as_bytes())
        .map_err(|error| write_error(&path, &error))
}

/// The failed error for a path that could not be written.
///
/// Implements: rust-retry/retry-record
fn write_error(path: &Path, error: &std::io::Error) -> FeatureError {
    text::failed(format!("cannot write {}: {error}", path.display()))
}
