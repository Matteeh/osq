//! Reading the project's manual edit records under `openspec/manual/`.
//!
//! A record is a Markdown file whose frontmatter holds a string `kept_at` and a
//! `paths` list; every other file is left out. Records are ordered by
//! `kept_at`, and equal times by file name.
//!
//! Implements: rust-storage/manual-edit-records

use std::fs;
use std::path::Path;

use yaml_rust2::Yaml;

use super::text::{frontmatter_yaml, markdown_body};

/// One manual edit record: a human's kept edit and the specs it touches.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManualEdit {
    /// The record's file name, without its folder.
    pub file: String,
    /// The keep time, as the frontmatter writes it.
    pub kept_at: String,
    /// The string entries of `paths`, in written order.
    pub paths: Vec<String>,
    /// The string entries of `capabilities`, in written order.
    pub capabilities: Vec<String>,
    /// The body, trimmed.
    pub comment: String,
}

/// Reads every manual edit record, ordered by `kept_at` then file name.
///
/// Implements: rust-storage/manual-edit-records
#[must_use]
pub fn read_manual_edits(project_root: &Path) -> Vec<ManualEdit> {
    let dir = project_root.join("openspec").join("manual");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut records: Vec<ManualEdit> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            name.strip_suffix(".md")?;
            let text = fs::read_to_string(dir.join(&name)).ok()?;
            parse_record(&name, &text)
        })
        .collect();
    records.sort_by(|left, right| {
        left.kept_at
            .cmp(&right.kept_at)
            .then_with(|| left.file.cmp(&right.file))
    });
    records
}

/// One file's record, or `None` without a string `kept_at` and a `paths` list.
fn parse_record(file: &str, text: &str) -> Option<ManualEdit> {
    let document = frontmatter_yaml(text)?;
    let mapping = document.as_hash()?;
    let kept_at = mapping
        .get(&Yaml::String(String::from("kept_at")))?
        .as_str()?
        .to_owned();
    let paths = string_entries(
        mapping
            .get(&Yaml::String(String::from("paths")))?
            .as_vec()?,
    );
    let capabilities = mapping
        .get(&Yaml::String(String::from("capabilities")))
        .and_then(Yaml::as_vec)
        .map_or_else(Vec::new, |entries| string_entries(entries));
    Some(ManualEdit {
        file: file.to_owned(),
        kept_at,
        paths,
        capabilities,
        comment: markdown_body(text).trim().to_owned(),
    })
}

/// The string entries of a YAML list, in written order.
fn string_entries(entries: &[Yaml]) -> Vec<String> {
    entries
        .iter()
        .filter_map(Yaml::as_str)
        .map(ToOwned::to_owned)
        .collect()
}
