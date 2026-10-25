//! Step 5's proposal verify and check commands.

use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::Path;
use std::time::Duration;

use osq_core::event::{Envelope, Event, SyncStopReason, VerifyRanData, event_line};
use osq_kernel_config::{Limits, Timeouts};
use osq_kernel_specs::{Frontmatter, js_trim, parse_frontmatter, parse_proposal};

use super::{active::Picked, command, stop::Stop, text, time};

/// The archived proposal's commands.
#[derive(Default)]
struct Commands {
    /// The proposal's change-level verify, or empty text.
    verify: String,
    /// The proposal's `check`, when its frontmatter holds one.
    check: Option<String>,
}

/// One command run: its exit code, output and duration.
type Run = (i32, String, Duration);

/// The change folder one run records into, and its task and change env.
struct Target<'a> {
    /// The change folder holding `.run/logs` and `.run/events`.
    folder: &'a Path,
    /// The task the run belongs to, or none for an archived change.
    task: Option<&'a str>,
    /// The absolute change folder the run's `OSQ_CHANGE` holds.
    change_env: Option<String>,
}

/// The sizes a stop tail and a `verify_ran` excerpt keep.
struct Tails {
    /// The most lines a stop tail keeps.
    output: usize,
    /// The most lines a `verify_ran` excerpt keeps.
    marker: usize,
    /// The most characters a kept excerpt line keeps.
    chars: usize,
}

/// Runs the archived proposal's verify and check, recording each pass.
///
/// # Errors
///
/// Returns a `sync_verify_red` stop when a command exits non-zero.
///
/// Implements: rust-land/land-sync-verify
pub(crate) fn run(
    worktree: &Path,
    archived: &Path,
    folder: &str,
    default_branch: &str,
    timeouts: &Timeouts,
    limits: &Limits,
) -> Result<(), Stop> {
    let commands = commands(archived);
    let tails = Tails {
        output: usize::try_from(limits.card_output_lines).unwrap_or(usize::MAX),
        marker: usize::try_from(limits.marker_output_lines).unwrap_or(usize::MAX),
        chars: usize::try_from(limits.marker_line_chars).unwrap_or(usize::MAX),
    };
    if !commands.verify.is_empty() {
        let prefix =
            format!("{folder}: verify failed on osq/{folder} merged with {default_branch}:");
        one(
            worktree,
            &Target {
                folder: archived,
                task: None,
                change_env: None,
            },
            &commands.verify,
            &prefix,
            timeouts,
            &tails,
        )?;
    }
    if let Some(check) = commands.check.as_deref() {
        let prefix =
            format!("{folder}: check failed on osq/{folder} merged with {default_branch}:");
        one(
            worktree,
            &Target {
                folder: archived,
                task: None,
                change_env: None,
            },
            check,
            &prefix,
            timeouts,
            &tails,
        )?;
    }
    Ok(())
}

/// Runs each done task's verify on the merged tree, recording every pass.
///
/// # Errors
///
/// Returns a `sync_verify_red` stop when both runs of a task's verify fail.
///
/// Implements: rust-land/active-sync-verify
pub(crate) fn run_active(
    worktree: &Path,
    change: &Path,
    folder: &str,
    default_branch: &str,
    timeouts: &Timeouts,
    limits: &Limits,
    tasks: &[Picked],
) -> Result<(), Stop> {
    let tails = Tails {
        output: usize::try_from(limits.card_output_lines).unwrap_or(usize::MAX),
        marker: usize::try_from(limits.marker_output_lines).unwrap_or(usize::MAX),
        chars: usize::try_from(limits.marker_line_chars).unwrap_or(usize::MAX),
    };
    let change_folder = change
        .canonicalize()
        .unwrap_or_else(|_| change.to_path_buf());
    let change_folder = change_folder.to_string_lossy().into_owned();
    for task in tasks {
        let prefix = format!(
            "{folder}: verify of task {} failed on osq/{folder} merged with {default_branch}:",
            task.id
        );
        one(
            worktree,
            &Target {
                folder: change,
                task: Some(task.id.as_str()),
                change_env: Some(change_folder.clone()),
            },
            &task.verify,
            &prefix,
            timeouts,
            &tails,
        )?;
    }
    Ok(())
}

/// Runs one command, once more when it fails, and records every pass.
///
/// Implements: rust-land/land-sync-verify
fn one(
    worktree: &Path,
    target: &Target<'_>,
    command: &str,
    stop_prefix: &str,
    timeouts: &Timeouts,
    tails: &Tails,
) -> Result<(), Stop> {
    let first = command::run_timed_with(worktree, command, timeouts, target.change_env.clone());
    if first.0 == 0 {
        return record(target, command, &first, tails);
    }
    let second = command::run_timed_with(worktree, command, timeouts, target.change_env.clone());
    if second.0 == 0 {
        record(target, command, &first, tails)?;
        return record(target, command, &second, tails);
    }
    let message = format!(
        "{stop_prefix}\n{}",
        text::output_tail(&second.1, tails.output)
    );
    Err(Stop::new(SyncStopReason::SyncVerifyRed, message))
}

/// Writes one run's log and appends its `verify_ran` event.
///
/// Implements: rust-land/land-sync-verify
fn record(target: &Target<'_>, command: &str, run: &Run, tails: &Tails) -> Result<(), Stop> {
    let log = write_log(target.folder, &run.1)?;
    append_event(
        &target
            .folder
            .join(".run")
            .join("events")
            .join("change.jsonl"),
        command,
        run,
        log,
        tails,
        target.task,
    )
}

/// The archived proposal's verify and check commands.
///
/// Implements: rust-land/land-sync-verify
fn commands(archived: &Path) -> Commands {
    let Ok(text) = fs::read_to_string(archived.join("proposal.md")) else {
        return Commands::default();
    };
    let verify = parse_proposal(&text)
        .map(|proposal| proposal.verify)
        .unwrap_or_default();
    let check = parse_frontmatter(&text)
        .ok()
        .and_then(|frontmatter| check_field(&frontmatter));
    Commands { verify, check }
}

/// Writes the whole output to the next free log and gives its relative path.
///
/// Implements: rust-land/land-sync-verify
fn write_log(archived: &Path, output: &str) -> Result<String, Stop> {
    let logs = archived.join(".run").join("logs");
    fs::create_dir_all(&logs).map_err(|error| Stop::failed(error.to_string()))?;
    let gitignore = logs.join(".gitignore");
    if !gitignore.exists() {
        fs::write(&gitignore, "*\n").map_err(|error| Stop::failed(error.to_string()))?;
    }
    let next = count_logs(&logs) + 1;
    let relative = format!(".run/logs/change-{next}.log");
    fs::write(archived.join(&relative), output).map_err(|error| Stop::failed(error.to_string()))?;
    Ok(relative)
}

/// How many `change-<digits>.log` files the logs folder holds.
///
/// Implements: rust-land/land-sync-verify
fn count_logs(logs: &Path) -> usize {
    let Ok(entries) = fs::read_dir(logs) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter(|entry| entry.file_name().to_str().is_some_and(is_log_name))
        .count()
}

/// Whether a file name is `change-<digits>.log`.
///
/// Implements: rust-land/land-sync-verify
fn is_log_name(name: &str) -> bool {
    name.strip_prefix("change-")
        .and_then(|rest| rest.strip_suffix(".log"))
        .is_some_and(|digits| {
            !digits.is_empty() && digits.chars().all(|character| character.is_ascii_digit())
        })
}

/// Appends the `verify_ran` event for one run.
///
/// Implements: rust-land/land-sync-verify
fn append_event(
    path: &Path,
    command: &str,
    run: &Run,
    log: String,
    tails: &Tails,
    task: Option<&str>,
) -> Result<(), Stop> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| Stop::failed(error.to_string()))?;
    }
    let millis = u64::try_from(run.2.as_millis()).unwrap_or(u64::MAX);
    let tail = tail_verify_output(&run.1, tails.marker, tails.chars);
    let data = VerifyRanData {
        command: command.to_owned(),
        exit_code: Some(i64::from(run.0)),
        duration: Some(serde_json::Number::from(millis)),
        log: Some(log),
        verify_command: None,
        output: (!tail.is_empty()).then_some(tail),
        phase: None,
        expected: None,
        mismatch: None,
        missing_paths: None,
        task: task.map(str::to_owned),
    };
    let envelope = Envelope {
        timestamp: time::format_utc(time::now_ms()),
        event: Event::VerifyRan(data),
    };
    let line = format!("{}\n", event_line(&envelope));
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .map_err(|error| Stop::failed(error.to_string()))?;
    file.write_all(line.as_bytes())
        .map_err(|error| Stop::failed(error.to_string()))
}

/// The tail a `verify_ran` event keeps of a command's output.
///
/// Implements: rust-land/land-sync-verify
fn tail_verify_output(output: &str, max_lines: usize, max_chars: usize) -> String {
    let trimmed = output.trim_end();
    if trimmed.is_empty() {
        return String::new();
    }
    let lines: Vec<&str> = trimmed.split('\n').collect();
    let within =
        lines.len() <= max_lines && lines.iter().all(|line| line.chars().count() <= max_chars);
    if within {
        return output.to_owned();
    }
    let start = lines.len().saturating_sub(max_lines);
    lines[start..]
        .iter()
        .map(|line| cut_line(line, max_chars))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Keeps the first `max_chars` characters of a line and counts the rest.
///
/// Implements: rust-land/land-sync-verify
fn cut_line(line: &str, max_chars: usize) -> String {
    let length = line.chars().count();
    if length <= max_chars {
        return (*line).to_owned();
    }
    let kept: String = line.chars().take(max_chars).collect();
    format!("{kept}… ({} more characters)", length - max_chars)
}

/// Reads the trimmed `check` field of a proposal's frontmatter.
///
/// Implements: rust-land/land-sync-verify
fn check_field(frontmatter: &Frontmatter) -> Option<String> {
    frontmatter
        .data
        .iter()
        .find(|(key, _)| key.as_str() == Some("check"))
        .and_then(|(_, value)| value.as_str())
        .map(js_trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
