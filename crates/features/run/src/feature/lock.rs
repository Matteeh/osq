//! The task's running lock, taken only when no other run holds it.

use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use osq_core::FeatureError;

use super::time;

/// The `.run/running/<task>.pid` path of one task.
fn lock_path(folder: &Path, task: &str) -> PathBuf {
    folder
        .join(".run")
        .join("running")
        .join(format!("{task}.pid"))
}

/// Creates the lock when it is absent, giving whether this run took it.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when the running folder or
/// the lock file cannot be created or written.
///
/// Implements: rust-run/run-lock
pub(crate) fn acquire(folder: &Path, task: &str) -> Result<bool, FeatureError> {
    let path = lock_path(folder, task);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| failed(parent, &error))?;
    }
    let payload = format!(
        "{{\"pid\":{},\"startedAt\":{}}}",
        std::process::id(),
        time::now_ms()
    );
    let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::AlreadyExists => return Ok(false),
        Err(error) => return Err(failed(&path, &error)),
    };
    file.write_all(payload.as_bytes())
        .map_err(|error| failed(&path, &error))?;
    Ok(true)
}

/// Removes the lock, tolerating a lock that is already absent.
///
/// Implements: rust-run/run-lock
pub(crate) fn release(folder: &Path, task: &str) {
    let _ = fs::remove_file(lock_path(folder, task));
}

/// Builds the failed error for a lock path that could not be written.
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    FeatureError::failed("run", format!("cannot write {}: {error}", path.display()))
}
