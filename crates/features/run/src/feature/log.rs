//! Writing a verify's whole output to the change folder's logs.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;

/// Writes the whole output to the next free log and gives its relative path.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when the logs folder, its
/// `.gitignore` or the log file cannot be created or written.
///
/// Implements: rust-run/run-verdict
pub(crate) fn write_log(
    change_folder: &Path,
    target: &str,
    output: &str,
) -> Result<String, FeatureError> {
    let logs = change_folder.join(".run").join("logs");
    fs::create_dir_all(&logs).map_err(|error| failed(&logs, &error))?;
    let gitignore = logs.join(".gitignore");
    if !gitignore.exists() {
        fs::write(&gitignore, "*\n").map_err(|error| failed(&gitignore, &error))?;
    }
    let next = count_logs(&logs, target) + 1;
    let relative = format!(".run/logs/{target}-{next}.log");
    fs::write(change_folder.join(&relative), output)
        .map_err(|error| failed(&change_folder.join(&relative), &error))?;
    Ok(relative)
}

/// How many `<target>-<digits>.log` files the logs folder holds.
///
/// Implements: rust-run/run-verdict
fn count_logs(logs: &Path, target: &str) -> usize {
    let Ok(entries) = fs::read_dir(logs) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| is_log_name(name, target))
        })
        .count()
}

/// Whether a file name is `<target>-<digits>.log`.
///
/// Implements: rust-run/run-verdict
fn is_log_name(name: &str, target: &str) -> bool {
    let prefix = format!("{target}-");
    name.strip_prefix(&prefix)
        .and_then(|rest| rest.strip_suffix(".log"))
        .is_some_and(|digits| {
            !digits.is_empty() && digits.chars().all(|character| character.is_ascii_digit())
        })
}

/// Builds the failed error for a log path that could not be written.
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    FeatureError::failed("run", format!("cannot write {}: {error}", path.display()))
}
