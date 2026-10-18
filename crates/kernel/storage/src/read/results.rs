//! Reading a change's executor result files into its disclosures.
//!
//! Only `.run/results/<n>.md` files whose name is digits and `.md` count, in
//! numeric order, and only a file holding a real disclosure keeps an entry.
//!
//! Implements: rust-storage/result-disclosures

use std::fs;
use std::path::Path;

use super::sections::parse_result_sections;

/// One task result file that holds at least one real disclosure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskDisclosure {
    /// The task id, as the result file's name writes it.
    pub task: String,
    /// The `## Deviated` section.
    pub deviated: Option<String>,
    /// The `## Missing context` section.
    pub missing_context: Option<String>,
    /// The `## Outside scope` section.
    pub outside_scope: Option<String>,
}

/// Reads a change folder's result files into its disclosures, in numeric order.
///
/// Implements: rust-storage/result-disclosures
#[must_use]
pub(crate) fn read_disclosures(folder: &Path) -> Vec<TaskDisclosure> {
    let dir = folder.join(".run").join("results");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut files: Vec<(u64, String)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let number = result_number(&name)?;
            Some((number, name))
        })
        .collect();
    files.sort_by_key(|(number, _)| *number);
    files
        .into_iter()
        .filter_map(|(_, name)| disclosure(&dir, &name))
        .collect()
}

/// The numeric name of a `<n>.md` result file, or `None` for any other name.
fn result_number(name: &str) -> Option<u64> {
    let stem = name.strip_suffix(".md")?;
    if !stem.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    stem.parse().ok()
}

/// One file's disclosure, or `None` when it holds none or cannot be read.
fn disclosure(dir: &Path, name: &str) -> Option<TaskDisclosure> {
    let text = fs::read_to_string(dir.join(name)).ok()?;
    let sections = parse_result_sections(&text);
    if sections.deviated.is_none()
        && sections.missing_context.is_none()
        && sections.outside_scope.is_none()
    {
        return None;
    }
    Some(TaskDisclosure {
        task: name.strip_suffix(".md").unwrap_or(name).to_owned(),
        deviated: sections.deviated,
        missing_context: sections.missing_context,
        outside_scope: sections.outside_scope,
    })
}
