//! Renaming the active markers into history and recording the retry.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_core::event::{Envelope, Event, RetryData, event_line};
use osq_kernel_config::Config;
use osq_kernel_vcs::{GitVcs, Vcs};

use super::args::CHANGE;
use super::marker::Failure;
use super::text;
use super::time;

/// The printed retry and the files the record retained.
pub(crate) struct Recorded {
    /// The text the retry prints.
    pub(crate) text: String,
    /// Each retained file relative to the change folder.
    pub(crate) retained: Vec<String>,
}

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
) -> Result<Recorded, FeatureError> {
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
    let text = text::retried(id, target, failure.reason.as_str(), attempt, &retained);
    Ok(Recorded { text, retained })
}

/// Commits an archived retry's marker, event and retained files.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when a path cannot be
/// read from `HEAD`, when `vcs.author` is absent, or when the commit fails;
/// a failed commit restores and restages every path first.
///
/// Implements: rust-retry/archived-retry
pub(crate) fn commit(
    tree: &Path,
    folder: &Path,
    id: &str,
    config: &Config,
    retained: &[String],
) -> Result<(), FeatureError> {
    let vcs = GitVcs::new(tree).with_timeouts(&config.timeouts);
    let Some(author) = config.vcs.author.as_deref() else {
        return Err(text::failed(
            "vcs.author is required when vcs.enabled is true",
        ));
    };
    let files = commit_files(folder, retained);
    let paths: Vec<String> = files.iter().map(|path| relative(tree, path)).collect();
    let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    let earlier = paths
        .iter()
        .map(|path| vcs.show("HEAD", path))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| text::failed(error.to_string()))?;
    match vcs.commit(&refs, &format!("osq: {id} land retry"), author) {
        Ok(_) => Ok(()),
        Err(error) => {
            restore_all(&files, &earlier);
            let _ = vcs.stage(&refs);
            Err(text::commit_failed(&error.to_string()))
        }
    }
}

/// The active marker, the change event and every retained file.
///
/// Implements: rust-retry/archived-retry
fn commit_files(folder: &Path, retained: &[String]) -> Vec<PathBuf> {
    let run = folder.join(".run");
    let mut files = vec![
        run.join("regressed").join(format!("{CHANGE}.md")),
        run.join("events").join(format!("{CHANGE}.jsonl")),
    ];
    files.extend(retained.iter().map(|path| folder.join(path)));
    files
}

/// Puts each file back as `HEAD` holds it, removing one `HEAD` lacks.
///
/// Implements: rust-retry/archived-retry
fn restore_all(files: &[PathBuf], earlier: &[Option<String>]) {
    for (path, text) in files.iter().zip(earlier) {
        match text {
            Some(text) => {
                if let Some(parent) = path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(path, text);
            }
            None => {
                let _ = fs::remove_file(path);
            }
        }
    }
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
/// Implements: rust-retry/archived-retry
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
