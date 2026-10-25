//! The keep half of `manual`: the record, the commit and the lines it prints.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use osq_core::{FeatureError, Output};
use osq_kernel_config::Config;
use osq_kernel_specs::{owner_capabilities, read_capability_ownership};
use osq_kernel_storage::scope::write_frontmatter;
use osq_kernel_vcs::{GitVcs, StatusEntry, Vcs};
use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

use crate::paths;
use crate::time;

/// Builds the `Failed` error every keep failure uses.
fn failed(message: impl Into<String>) -> FeatureError {
    FeatureError::failed("manual", message)
}

/// Turns a file error into the command's failure.
fn io_failed(error: &std::io::Error) -> FeatureError {
    failed(error.to_string())
}

/// Keeps the selected entries, writing the record and committing both.
///
/// # Errors
///
/// Returns a `Failed` error when the record cannot be written or git refuses
/// the commit.
///
/// Implements: rust-manual/manual-keep
pub(crate) fn run(
    root: &Path,
    config: &Config,
    status: &[StatusEntry],
    kept: &[StatusEntry],
    comment: &str,
    now_ms: Option<i64>,
) -> Result<Output, FeatureError> {
    let record_paths = record_paths(kept);
    let kept_at = time::format_utc(now_ms.unwrap_or_else(time::now_ms));
    let capabilities = capabilities(root, &record_paths);
    let commit = write_record_and_commit(
        root,
        config,
        comment,
        &kept_at,
        &record_paths,
        &capabilities,
    )?;
    let mut lines = vec![format!(
        "Kept {} as {}",
        record_paths.join(", "),
        short(&commit)
    )];
    let left_out = left_out_untracked(status, kept);
    if !left_out.is_empty() {
        lines.push(format!(
            "Left out untracked: {}; name them to keep them",
            left_out.join(", ")
        ));
    }
    Ok(Output::text(format!("{}\n", lines.join("\n"))))
}

/// The kept entries' paths and rename sources, distinct and sorted by bytes.
fn record_paths(kept: &[StatusEntry]) -> Vec<String> {
    let mut paths = BTreeSet::new();
    for entry in kept {
        paths.insert(entry.path.clone());
        if let Some(from) = &entry.from {
            paths.insert(from.clone());
        }
    }
    paths.into_iter().collect()
}

/// The distinct capabilities that own any of `paths`, sorted by bytes.
fn capabilities(root: &Path, paths: &[String]) -> Vec<String> {
    let specs = root.join("openspec").join("specs");
    let ownerships = read_capability_ownership(&specs);
    let mut names = BTreeSet::new();
    for path in paths {
        names.extend(owner_capabilities(&ownerships, path));
    }
    names.into_iter().collect()
}

/// Renders the record's text from its fields.
fn render_record(
    kept_at: &str,
    paths: &[String],
    capabilities: &[String],
    comment: &str,
) -> String {
    let mut mapping = Hash::new();
    mapping.insert(
        Yaml::String(String::from("kept_at")),
        Yaml::String(kept_at.to_owned()),
    );
    mapping.insert(Yaml::String(String::from("paths")), list(paths));
    mapping.insert(
        Yaml::String(String::from("capabilities")),
        list(capabilities),
    );
    format!("---\n{}---\n{comment}\n", write_frontmatter(&mapping))
}

/// One YAML list of strings.
fn list(values: &[String]) -> Yaml {
    Yaml::Array(
        values
            .iter()
            .map(|value| Yaml::String(value.clone()))
            .collect(),
    )
}

/// The record's path relative to the project root.
fn record_relative(kept_at: &str) -> String {
    format!("openspec/manual/{}.md", kept_at.replace([':', '.'], "-"))
}

/// Writes the record and commits it with the kept paths, removing it on failure.
fn write_record_and_commit(
    root: &Path,
    config: &Config,
    comment: &str,
    kept_at: &str,
    paths: &[String],
    capabilities: &[String],
) -> Result<String, FeatureError> {
    let relative = record_relative(kept_at);
    let record = root.join(&relative);
    if let Some(parent) = record.parent() {
        fs::create_dir_all(parent).map_err(|error| io_failed(&error))?;
    }
    fs::write(
        &record,
        render_record(kept_at, paths, capabilities, comment),
    )
    .map_err(|error| io_failed(&error))?;
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let author = resolve_author(&vcs, config);
    let mut commit_paths: Vec<&str> = paths.iter().map(String::as_str).collect();
    commit_paths.push(&relative);
    match vcs.commit(&commit_paths, &commit_message(comment), &author) {
        Ok(commit) => Ok(commit),
        Err(error) => {
            let _ = fs::remove_file(&record);
            Err(failed(error.to_string()))
        }
    }
}

/// The commit author from git config, or `vcs.author` when either is unset.
fn resolve_author(vcs: &GitVcs, config: &Config) -> String {
    let name = vcs.config_value("user.name").ok().flatten();
    let email = vcs.config_value("user.email").ok().flatten();
    match (name, email) {
        (Some(name), Some(email)) => format!("{name} <{email}>"),
        _ => config.vcs.author.clone().unwrap_or_default(),
    }
}

/// The commit message: the subject with the comment's first line, the rest below.
fn commit_message(comment: &str) -> String {
    let (first, rest) = match comment.split_once('\n') {
        Some((first, rest)) => (first, Some(rest)),
        None => (comment, None),
    };
    let subject = format!("osq: manual {first}");
    match rest {
        Some(rest) => format!("{subject}\n\n{rest}"),
        None => subject,
    }
}

/// The commit's first seven characters.
fn short(commit: &str) -> &str {
    commit.get(..7).unwrap_or(commit)
}

/// The untracked entries a keep leaves out, distinct and sorted by bytes.
fn left_out_untracked(status: &[StatusEntry], kept: &[StatusEntry]) -> Vec<String> {
    let mut names = BTreeSet::new();
    for entry in status {
        if entry.code == "??" && !paths::is_under_changes(&entry.path) && !kept.contains(entry) {
            names.insert(entry.path.clone());
        }
    }
    names.into_iter().collect()
}
