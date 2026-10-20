//! Scanning a Cargo workspace's runtime code for calls that spawn Node.

use crate::scan::{NodeSpawn, ScanError, node_spawns};
use std::fs;
use std::path::{Path, PathBuf};

/// The root manifest's file name.
const MANIFEST: &str = "Cargo.toml";
/// The `[workspace]` table header.
const WORKSPACE_TABLE: &str = "[workspace]";
/// The key naming the workspace's members.
const MEMBERS_KEY: &str = "members";

/// Returns every Node spawn in the runtime code of the workspace at `root`.
///
/// # Errors
///
/// Returns `ScanError::Manifest` for an unusable members array, and
/// `ScanError::Read` or `ScanError::Parse` for a file it cannot scan.
///
/// Implements: rust-linter/workspace-node-spawns
pub fn workspace_node_spawns(root: &Path) -> Result<Vec<NodeSpawn>, ScanError> {
    let manifest_path = root.join(MANIFEST);
    let manifest = read_text(&manifest_path)?;
    let members = parse_members(&manifest).map_err(|message| ScanError::Manifest {
        path: manifest_path,
        message,
    })?;
    let mut spawns = Vec::new();
    for member in members {
        spawns.extend(member_spawns(root, &member)?);
    }
    Ok(spawns)
}

/// Returns every Node spawn in one member's `src/` folder.
fn member_spawns(root: &Path, member: &str) -> Result<Vec<NodeSpawn>, ScanError> {
    let mut files = Vec::new();
    collect_rust_files(&root.join(member).join("src"), &mut files);
    files.sort_by(|left, right| {
        left.as_os_str()
            .as_encoded_bytes()
            .cmp(right.as_os_str().as_encoded_bytes())
    });
    let mut spawns = Vec::new();
    for file in files {
        let source = read_text(&file)?;
        let name = relative_slash_path(root, &file);
        spawns.extend(node_spawns(&name, &source)?);
    }
    Ok(spawns)
}

/// Reads one file as UTF-8 text, naming its path when it cannot.
fn read_text(path: &Path) -> Result<String, ScanError> {
    fs::read_to_string(path).map_err(|error| ScanError::Read {
        path: path.to_path_buf(),
        message: error.to_string(),
    })
}

/// Collects every `.rs` file under a directory, at any depth.
fn collect_rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_rust_files(&path, out);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            out.push(path);
        }
    }
}

/// Writes a path relative to `root` with `/` separators.
fn relative_slash_path(root: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let mut parts = Vec::new();
    for component in relative.components() {
        parts.push(component.as_os_str().to_string_lossy().into_owned());
    }
    parts.join("/")
}

/// Reads the double-quoted members of the `[workspace]` table.
fn parse_members(manifest: &str) -> Result<Vec<String>, String> {
    let lines: Vec<&str> = manifest.lines().collect();
    let start = lines
        .iter()
        .position(|line| strip_comment(line).trim() == WORKSPACE_TABLE)
        .ok_or_else(|| "the manifest has no [workspace] table".to_owned())?;
    let mut collected = String::new();
    let mut collecting = false;
    let mut depth = 0isize;
    for line in &lines[start + 1..] {
        let code = strip_comment(line);
        if collecting {
            collected.push('\n');
            collected.push_str(code);
            depth += bracket_delta(code);
            if depth == 0 {
                break;
            }
        } else {
            let trimmed = code.trim();
            if trimmed.starts_with('[') {
                break;
            }
            let Some(rest) = members_value(trimmed) else {
                continue;
            };
            collecting = true;
            collected.push_str(rest);
            depth = bracket_delta(rest);
            if depth == 0 && rest.contains('[') {
                break;
            }
        }
    }
    if !collecting {
        return Err("the [workspace] table has no members array".to_owned());
    }
    let members = quoted_strings(&collected);
    if let Some(member) = members.iter().find(|member| member.contains('*')) {
        return Err(format!("the workspace member `{member}` holds a wildcard"));
    }
    Ok(members)
}

/// Returns the text after a `members =` key on a line, if the line holds one.
fn members_value(line: &str) -> Option<&str> {
    let rest = line.strip_prefix(MEMBERS_KEY)?;
    let rest = rest.trim_start();
    let rest = rest.strip_prefix('=')?;
    Some(rest.trim_start())
}

/// Returns a line without its `#` comment.
fn strip_comment(line: &str) -> &str {
    match line.find('#') {
        Some(index) => &line[..index],
        None => line,
    }
}

/// Counts array brackets.
fn bracket_delta(text: &str) -> isize {
    let mut depth = 0isize;
    for character in text.chars() {
        match character {
            '[' => depth += 1,
            ']' => depth -= 1,
            _ => {}
        }
    }
    depth
}

/// Reads the double-quoted strings of an array.
fn quoted_strings(text: &str) -> Vec<String> {
    let mut members = Vec::new();
    for (index, part) in text.split('"').enumerate() {
        if index % 2 == 1 {
            members.push(part.to_owned());
        }
    }
    members
}
