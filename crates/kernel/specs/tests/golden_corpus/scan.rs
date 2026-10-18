//! Small filesystem helpers shared by the corpus discovery.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// The change number a folder name leads with, if it leads with digits.
#[must_use]
pub fn leading_number(name: &str) -> Option<u32> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// A path's file name as text.
#[must_use]
pub fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Adds `file` under `base` and `name` to `out` when it exists.
pub fn add_file(file: &Path, base: &str, name: &str, out: &mut BTreeMap<String, PathBuf>) {
    if file.is_file() {
        out.insert(format!("{base}/{name}"), file.to_path_buf());
    }
}

/// Adds every `.md` file of `dir` under `base/name` to `out`.
pub fn add_markdown(dir: &Path, base: &str, name: &str, out: &mut BTreeMap<String, PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let file = entry.path();
        let is_markdown = file.is_file()
            && file
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
        if is_markdown {
            out.insert(format!("{base}/{name}/{}", file_name(&file)), file);
        }
    }
}

/// Adds every `<capability>/spec.md` of `dir` under `base/specs` to `out`.
pub fn add_specs(dir: &Path, base: &str, out: &mut BTreeMap<String, PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let file = entry.path().join("spec.md");
        if file.is_file() {
            out.insert(
                format!("{base}/specs/{}/spec.md", file_name(&entry.path())),
                file,
            );
        }
    }
}
