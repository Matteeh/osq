//! Reading, writing, removing and restoring the files a sync touches.

use std::fs;
use std::io;
use std::path::Path;

/// Reads a file's bytes, or none when it cannot be read.
///
/// Implements: rust-land/land-sync
pub(crate) fn read(path: &Path) -> Option<Vec<u8>> {
    fs::read(path).ok()
}

/// Writes `contents` at `path`, or removes `path` when there are none.
///
/// # Errors
///
/// Returns the operating system's error for a folder, write or removal.
///
/// Implements: rust-land/land-sync
pub(crate) fn write_or_remove(path: &Path, contents: Option<&str>) -> io::Result<()> {
    match contents {
        Some(contents) => {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(path, contents)
        }
        None => remove(path),
    }
}

/// Removes a file, treating a missing one as already removed.
///
/// # Errors
///
/// Returns the operating system's error for a removal other than not-found.
///
/// Implements: rust-land/land-sync
pub(crate) fn remove(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

/// Puts a file's bytes back, or removes it when there were none.
///
/// # Errors
///
/// Returns the operating system's error for a folder, write or removal.
///
/// Implements: rust-land/land-sync
pub(crate) fn restore(path: &Path, before: Option<&[u8]>) -> io::Result<()> {
    match before {
        Some(bytes) => {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(path, bytes)
        }
        None => remove(path),
    }
}
