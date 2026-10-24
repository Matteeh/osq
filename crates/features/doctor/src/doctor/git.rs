//! Doctor's git line and its version-control warnings.
//!
//! The lines are pure text; only this module reads git and the project's setup
//! files (ADR 023). None of these lines fails, so none changes doctor's exit.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use osq_kernel_config::Config;
use osq_kernel_vcs::{GitVcs, LineEnding, Vcs};

/// Environment variables that would redirect osq's own git reads.
const GIT_ENV_VARS: [&str; 3] = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"];
/// Lockfiles whose presence asks for a `vcs.prepare` install command.
const LOCKFILES: [&str; 5] = [
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
];
/// The hooks git runs during a commit.
const COMMIT_HOOKS: [&str; 4] = [
    "pre-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
];
/// The git config values git itself treats as true.
const TRUE_VALUES: [&str; 4] = ["true", "1", "yes", "on"];
/// The managed line-endings block `.gitattributes` carries.
const GITATTRIBUTES_BLOCK: &str = "# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END";
/// The line when git's program cannot be found.
const GIT_NOT_FOUND: &str = "[warn] git: git not found; git checks off";
/// The line when the root is no repository.
const NOT_A_REPOSITORY: &str = "[warn] git: not a git repository; git checks off";
/// The line when the root lies below the repository's top level.
const NOT_THE_ROOT: &str = "[warn] git: not the repository root; git checks off";

/// The git check's lines and, when git is usable, its tracked paths.
pub(super) struct GitLines {
    /// The `git` line and every warning after it.
    pub(super) lines: Vec<String>,
    /// Every tracked path, in git's order, or none outside the usable case.
    pub(super) tracked: Option<Vec<String>>,
}

/// Builds the `git` line and every warning after the change lines.
///
/// Implements: rust-doctor/doctor-git-checks
pub(super) fn git_lines(root: &Path, config: &Config, env: &BTreeMap<String, String>) -> GitLines {
    let real = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let (line, usable) = git_line(&vcs, &real);
    let endings = if usable {
        vcs.line_endings().ok()
    } else {
        None
    };
    let tracked = endings
        .as_ref()
        .map(|entries| entries.iter().map(|entry| entry.path.clone()).collect());
    let mut lines = vec![line];
    if usable && config.vcs.enabled {
        lines.extend(vcs_warnings(root, config, &vcs, endings.as_deref()));
    }
    if let Some(line) = git_env_line(env) {
        lines.push(line);
    }
    GitLines { lines, tracked }
}

/// The `git` line and whether git is usable for the warnings after it.
///
/// Implements: rust-doctor/doctor-git-checks
fn git_line(vcs: &GitVcs, real: &Path) -> (String, bool) {
    let Ok(Some(version)) = vcs.version() else {
        return (GIT_NOT_FOUND.to_owned(), false);
    };
    match vcs.root() {
        Ok(Some(repo)) if repo == real => (format!("[ok] git: {version}"), true),
        Ok(Some(_)) => (NOT_THE_ROOT.to_owned(), false),
        Ok(None) | Err(_) => (NOT_A_REPOSITORY.to_owned(), false),
    }
}

/// The warnings shown only with `vcs.enabled` and a usable git.
///
/// Implements: rust-doctor/doctor-git-checks
fn vcs_warnings(
    root: &Path,
    config: &Config,
    vcs: &GitVcs,
    endings: Option<&[LineEnding]>,
) -> Vec<String> {
    let mut warnings = Vec::new();
    if let Some(line) = prepare_line(root, config) {
        warnings.push(line);
    }
    if let Some(line) = hooks_line(vcs) {
        warnings.push(line);
    }
    if let Some(line) = signing_line(vcs) {
        warnings.push(line);
    }
    if let Some(line) = attributes_line(root) {
        warnings.push(line);
    }
    if let Some(line) = endings_line(endings.unwrap_or_default(), config) {
        warnings.push(line);
    }
    warnings
}

/// The `vcs-prepare` warning when a lockfile exists without an install command.
///
/// Implements: rust-doctor/doctor-git-checks
fn prepare_line(root: &Path, config: &Config) -> Option<String> {
    if config
        .vcs
        .prepare
        .as_deref()
        .is_some_and(|value| !value.is_empty())
    {
        return None;
    }
    let locks: Vec<&str> = LOCKFILES
        .into_iter()
        .filter(|name| root.join(name).exists())
        .collect();
    if locks.is_empty() {
        return None;
    }
    Some(format!(
        "[warn] vcs-prepare: {} found without vcs.prepare; \
         set vcs.prepare to the install command",
        locks.join(", ")
    ))
}

/// The `git-hooks` warning for the active commit hooks, in git's order.
///
/// Implements: rust-doctor/doctor-git-checks
fn hooks_line(vcs: &GitVcs) -> Option<String> {
    let names: Vec<String> = vcs
        .hook_names()
        .unwrap_or_default()
        .into_iter()
        .filter(|name| COMMIT_HOOKS.contains(&name.as_str()))
        .collect();
    if names.is_empty() {
        return None;
    }
    Some(format!(
        "[warn] git-hooks: active commit hooks: {}; \
         check each runs unattended and leaves the tree as verified",
        names.join(", ")
    ))
}

/// The `git-signing` warning when `commit.gpgsign` is true.
///
/// Implements: rust-doctor/doctor-git-checks
fn signing_line(vcs: &GitVcs) -> Option<String> {
    let value = vcs.config_value("commit.gpgsign").ok().flatten()?;
    if !TRUE_VALUES.contains(&value.to_lowercase().as_str()) {
        return None;
    }
    Some(
        "[warn] git-signing: commit.gpgsign is true; check signing runs without a prompt"
            .to_owned(),
    )
}

/// The `gitattributes` warning when the root's file lacks the current block.
///
/// Implements: rust-doctor/doctor-git-checks
fn attributes_line(root: &Path) -> Option<String> {
    let current = fs::read_to_string(root.join(".gitattributes"))
        .is_ok_and(|text| text.contains(GITATTRIBUTES_BLOCK));
    if current {
        return None;
    }
    Some(
        "[warn] gitattributes: .gitattributes has no current osq line endings block; \
         run osq init"
            .to_owned(),
    )
}

/// The `git-line-endings` warning for CRLF or mixed index line endings.
///
/// Implements: rust-doctor/doctor-git-checks
fn endings_line(endings: &[LineEnding], config: &Config) -> Option<String> {
    let offenders: Vec<String> = endings
        .iter()
        .filter(|entry| entry.index == "crlf" || entry.index == "mixed")
        .map(|entry| entry.path.clone())
        .collect();
    let count = offenders.len();
    if count == 0 {
        return None;
    }
    let limit = usize::try_from(config.limits.max_listed_line_endings).unwrap_or(usize::MAX);
    let named = offenders
        .iter()
        .take(limit)
        .cloned()
        .collect::<Vec<String>>()
        .join(", ");
    let rest = count - limit.min(count);
    let more = if rest > 0 {
        format!(" and {rest} more")
    } else {
        String::new()
    };
    let verb = if count == 1 {
        "tracked file has"
    } else {
        "tracked files have"
    };
    Some(format!(
        "[warn] git-line-endings: {count} {verb} CRLF or mixed line endings: \
         {named}{more}; run git add --renormalize . and commit"
    ))
}

/// The `git-env` warning naming the redirecting variables set in the process
/// environment.
///
/// Implements: rust-doctor/doctor-git-checks
fn git_env_line(env: &BTreeMap<String, String>) -> Option<String> {
    let names: Vec<&str> = GIT_ENV_VARS
        .into_iter()
        .filter(|name| env.get(*name).is_some_and(|value| !value.is_empty()))
        .collect();
    match names.len() {
        0 => None,
        1 => Some(format!(
            "[warn] git-env: {} is set; osq's own git reads ignore it while \
             verify commands and hooks do not",
            names[0]
        )),
        _ => Some(format!(
            "[warn] git-env: {} are set; osq's own git reads ignore them while \
             verify commands and hooks do not",
            names.join(" and ")
        )),
    }
}
