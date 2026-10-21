//! Rewriting a change folder's approval seal after a test edits a sealed file.

use std::fs;
use std::path::Path;

use osq_kernel_storage::change_folder_seal;

/// Writes `change_folder_seal` of `folder` to its `.run/approved`.
pub fn reseal(folder: &Path) {
    let seal = change_folder_seal(folder).unwrap();
    fs::write(folder.join(".run").join("approved"), seal.as_str()).unwrap();
}
