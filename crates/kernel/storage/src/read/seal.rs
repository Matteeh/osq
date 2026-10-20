//! The seal of a change folder: the text a `.run/approved` marker holds.
//!
//! Implements: rust-storage/change-folder-seal

use std::ffi::OsStr;
use std::fs;
use std::path::Path;

use osq_core::{Seal, compute_seal};

use super::error::StorageError;

/// Path segments left out of the seal at any depth.
const EXCLUDED_SEGMENTS: [&str; 3] = [".run", ".git", ".DS_Store"];

/// The file left out of the seal at the folder's root only.
const ROOT_TRANSIENT: &str = "plan-prompt.md";

/// Gives the seal of a change folder, as `hashChangeFolder` does.
///
/// The walk does not follow symbolic links and reads only regular files. It
/// leaves out every path with a `.run`, `.git` or `.DS_Store` segment and
/// `plan-prompt.md` at the root.
///
/// # Errors
///
/// Returns [`StorageError::Read`] naming the path of a file or folder that
/// cannot be read.
///
/// Implements: rust-storage/change-folder-seal
pub fn change_folder_seal(folder: &Path) -> Result<Seal, StorageError> {
    let mut files = Vec::new();
    collect(folder, "", &mut files)?;
    let entries: Vec<(&str, &[u8])> = files
        .iter()
        .map(|(path, bytes)| (path.as_str(), bytes.as_slice()))
        .collect();
    Ok(compute_seal(&entries))
}

/// Reads a folder's kept files into `files`, as relative path and bytes.
fn collect(
    dir: &Path,
    prefix: &str,
    files: &mut Vec<(String, Vec<u8>)>,
) -> Result<(), StorageError> {
    let read_error = |path: &Path, source| StorageError::Read {
        path: path.to_path_buf(),
        source,
    };
    for entry in fs::read_dir(dir).map_err(|source| read_error(dir, source))? {
        let entry = entry.map_err(|source| read_error(dir, source))?;
        let name = entry.file_name();
        let name_text = name.to_string_lossy();
        if is_excluded(&name, prefix.is_empty()) {
            continue;
        }
        let path = entry.path();
        let kind = entry
            .file_type()
            .map_err(|source| read_error(&path, source))?;
        let relative = format!("{prefix}{name_text}");
        if kind.is_dir() {
            collect(&path, &format!("{relative}/"), files)?;
        } else if kind.is_file() {
            let bytes = fs::read(&path).map_err(|source| read_error(&path, source))?;
            files.push((relative, bytes));
        }
    }
    Ok(())
}

/// Whether a path segment is left out of the seal.
fn is_excluded(name: &OsStr, at_root: bool) -> bool {
    EXCLUDED_SEGMENTS.iter().any(|segment| name == *segment) || (at_root && name == ROOT_TRANSIENT)
}
