//! The one lock delivery takes per change.

use std::fs::{self, File, OpenOptions, TryLockError};
use std::io;
use std::path::Path;

use super::failure::ReactionFailure;

/// What taking a change's delivery lock gave.
pub(crate) enum DeliveryLock {
    /// The lock is held until the [`File`] is dropped.
    Held(File),
    /// Another handle holds the lock, so the holder delivers.
    Skipped,
    /// The lock could not be taken, with the failure to report.
    Failed(ReactionFailure),
}

/// Takes the exclusive lock on the change's `.run/delivery.lock`.
///
/// Implements: rust-loop/delivery-lock
pub(crate) fn take(change: &Path, name: &str) -> DeliveryLock {
    let run = change.join(".run");
    if let Err(error) = fs::create_dir_all(&run) {
        return failed(name, &error);
    }
    let file = match open(&run.join("delivery.lock")) {
        Ok(file) => file,
        Err(error) => return failed(name, &error),
    };
    match file.try_lock() {
        Ok(()) => DeliveryLock::Held(file),
        Err(TryLockError::WouldBlock) => DeliveryLock::Skipped,
        Err(TryLockError::Error(error)) => failed(name, &error),
    }
}

/// Opens the lock file, creating it and never truncating it.
///
/// Implements: rust-loop/delivery-lock
fn open(path: &Path) -> io::Result<File> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
}

/// Builds the failure a lock step reports.
///
/// Implements: rust-loop/delivery-lock
fn failed(change: &str, error: &io::Error) -> DeliveryLock {
    DeliveryLock::Failed(ReactionFailure::new(
        "delivery",
        "",
        change,
        format!("delivery lock of {change} could not be taken: {error}"),
    ))
}
