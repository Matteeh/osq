//! Replacing a small state file durably.

use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Replaces the file at `path` with `bytes`, so a crash leaves the old file
/// or the new one.
///
/// The bytes go to `.<file name>.tmp` in the same folder, which is synced and
/// renamed over `path`. On Unix the folder is synced too. No folder is
/// created. A failed step returns its error, and the temporary file is
/// removed when the rename did not happen.
///
/// # Errors
///
/// Returns the error of the step that failed: writing or syncing the
/// temporary file, renaming it over `path`, or syncing the folder.
///
/// Implements: rust-storage/durable-write
pub fn write_durable(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let temporary = temporary_path(path);
    let result = write_then_replace(path, &temporary, bytes);
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// The temporary path beside `path`: `.<file name>.tmp` in its folder.
fn temporary_path(path: &Path) -> PathBuf {
    let mut temporary = OsString::from(".");
    temporary.push(path.file_name().unwrap_or_default());
    temporary.push(".tmp");
    path.with_file_name(temporary)
}

/// Writes the temporary file, renames it, and syncs the folder.
fn write_then_replace(path: &Path, temporary: &Path, bytes: &[u8]) -> io::Result<()> {
    {
        let mut file = fs::File::create(temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(temporary, path)?;
    #[cfg(unix)]
    {
        let folder = std::path::absolute(path)?
            .parent()
            .map_or_else(|| PathBuf::from("/"), Path::to_path_buf);
        fs::File::open(folder)?.sync_all()?;
    }
    Ok(())
}
