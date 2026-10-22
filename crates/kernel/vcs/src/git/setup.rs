//! The setup reads' git arguments and their pure parsers.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use crate::VcsError;
use crate::port::LineEnding;

use super::GitVcs;

/// The first trimmed line of the version text, the output when it is not empty
/// and the error stream otherwise.
fn parse_version(stdout: &str, stderr: &str) -> String {
    let text = if stdout.is_empty() { stderr } else { stdout };
    text.trim()
        .lines()
        .next()
        .map_or_else(String::new, |line| line.trim().to_owned())
}

/// The executable, non-`.sample` hooks under the folder `output` names.
fn parse_hook_names(root: &Path, output: &str) -> Vec<String> {
    let hooks = output.trim();
    if hooks.is_empty() {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(root.join(hooks)) else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(".sample") {
            continue;
        }
        let Ok(metadata) = fs::metadata(entry.path()) else {
            continue;
        };
        if metadata.is_file() && metadata.permissions().mode() & 0o111 != 0 {
            names.push(name);
        }
    }
    names.sort();
    names
}

/// Parses `ls-files --eol -z` output into its entries.
fn parse_line_endings(output: &str) -> Vec<LineEnding> {
    let mut entries = Vec::new();
    for record in output.split('\0') {
        if record.is_empty() {
            continue;
        }
        let Some(tab) = record.find('\t') else {
            continue;
        };
        let fields = &record[..tab];
        let index = match fields.find(' ') {
            Some(space) => fields.get(2..space),
            None => fields.get(2..),
        };
        entries.push(LineEnding {
            path: record.get(tab + 1..).unwrap_or("").to_owned(),
            index: index.unwrap_or("").to_owned(),
        });
    }
    entries
}

/// Reads git's version.
pub(super) fn version(vcs: &GitVcs) -> Result<Option<String>, VcsError> {
    let output = vcs.run(&["--version"], &[], None)?;
    if !output.success {
        return Ok(None);
    }
    Ok(Some(parse_version(&output.stdout, &output.stderr)))
}

/// Reads the executable hook names from the folder git names.
pub(super) fn hook_names(vcs: &GitVcs) -> Result<Vec<String>, VcsError> {
    let output = vcs.read(&["rev-parse", "--git-path", "hooks"])?;
    Ok(output
        .as_deref()
        .map_or_else(Vec::new, |text| parse_hook_names(&vcs.root, text)))
}

/// Reads every tracked file's index line ending.
pub(super) fn line_endings(vcs: &GitVcs) -> Result<Vec<LineEnding>, VcsError> {
    let output = vcs.read(&["ls-files", "--eol", "-z"])?;
    Ok(output
        .as_deref()
        .map(parse_line_endings)
        .unwrap_or_default())
}
