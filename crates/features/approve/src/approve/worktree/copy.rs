//! Replacing the worktree's change folder with the checkout's copy.

use std::fs;
use std::io;
use std::path::Path;

/// Replaces `target` with a recursive copy of `source`.
///
/// # Errors
///
/// Returns the first folder or file error while removing or copying.
///
/// Implements: rust-approve/worktree-approval
pub(crate) fn replace(source: &Path, target: &Path) -> io::Result<()> {
    remove(target)?;
    copy(source, target)
}

/// Removes `path`, treating a missing folder as nothing to remove.
///
/// # Errors
///
/// Returns the folder error other than a missing folder.
///
/// Implements: rust-approve/worktree-approval
pub(crate) fn remove(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else if path.exists() {
        fs::remove_file(path)
    } else {
        Ok(())
    }
}

/// Copies the folder `from` into the new folder `to`.
fn copy(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}
