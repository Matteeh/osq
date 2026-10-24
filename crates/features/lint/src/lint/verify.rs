//! TypeScript's verify command analysis: what a command names, without running
//! it.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use osq_kernel_vcs::{GitVcs, Vcs};

/// Package managers whose direct or `run` invocations reference a script.
const PACKAGE_MANAGER_BINARIES: [&str; 4] = ["pnpm", "npm", "yarn", "bun"];
/// Package-script verbs that introduce the referenced script name.
const PACKAGE_RUN_VERBS: [&str; 2] = ["run", "run-script"];
/// Package-manager subcommands that are not package scripts.
const PACKAGE_MANAGER_SUBCOMMANDS: [&str; 39] = [
    "add",
    "audit",
    "bin",
    "cache",
    "config",
    "create",
    "dedupe",
    "dlx",
    "doctor",
    "env",
    "exec",
    "import",
    "init",
    "install",
    "licenses",
    "link",
    "list",
    "login",
    "logout",
    "ls",
    "outdated",
    "pack",
    "patch",
    "prune",
    "publish",
    "rebuild",
    "remove",
    "root",
    "setup",
    "store",
    "unlink",
    "uninstall",
    "update",
    "upgrade",
    "version",
    "whoami",
    "why",
    "workspace",
    "workspaces",
];
/// The `cargo` subcommands that start a recognized verify runner.
const CARGO_RUNNERS: [&str; 7] = ["test", "nextest", "build", "check", "clippy", "fmt", "run"];
/// The manifests that mark a package at the project root.
const ROOT_MANIFESTS: [&str; 4] = ["package.json", "Cargo.toml", "pyproject.toml", "go.mod"];
/// The manifest whose presence gives the project the Rust language.
const CARGO_MANIFEST: &str = "Cargo.toml";
/// The root file whose `scripts` object names the package scripts.
const PACKAGE_JSON: &str = "package.json";
/// The template verify command the planning sentinel writes.
const PLACEHOLDER_COMMAND: &str = "node -e \"process.exit(0)\"";

/// The project facts a verify command analysis reads once per lint run.
pub(crate) struct Project {
    /// The script names the root `package.json` declares.
    scripts: HashSet<String>,
    /// Whether the project's paths include Rust.
    rust: bool,
}

impl Project {
    /// Reads the root package scripts and the project's languages.
    ///
    /// Implements: rust-lint/lint-verify-commands
    pub(crate) fn read(root: &Path) -> Self {
        Self {
            scripts: package_scripts(root),
            rust: project_paths(root)
                .iter()
                .any(|path| last_part(path) == CARGO_MANIFEST),
        }
    }
}

/// What analysing one verify command found.
pub(crate) struct Analysis {
    /// The command is the template sentinel or a normalized equivalent.
    pub(crate) placeholder: bool,
    /// The recognized package script name that the root manifest lacks.
    pub(crate) missing_script: Option<String>,
    /// No existing repository path and no recognized package script was named.
    pub(crate) unresolved: bool,
}

/// Analyzes one verify command against the project without running it.
///
/// Implements: rust-lint/lint-verify-commands
pub(crate) fn analyze(root: &Path, command: &str, project: &Project) -> Analysis {
    let tokens = tokenize(command);
    if is_placeholder(&tokens) {
        return Analysis {
            placeholder: true,
            missing_script: None,
            unresolved: false,
        };
    }
    if let Some(script) = package_script(&tokens) {
        let missing = (!project.scripts.contains(&script)).then_some(script);
        return Analysis {
            placeholder: false,
            missing_script: missing,
            unresolved: false,
        };
    }
    if is_runner(&tokens, project.rust) {
        return Analysis {
            placeholder: false,
            missing_script: None,
            unresolved: false,
        };
    }
    Analysis {
        placeholder: false,
        missing_script: None,
        unresolved: !names_existing_path(root, &tokens),
    }
}

/// True when a command holds a shell chain operator.
///
/// Implements: rust-lint/lint-verify-commands
pub(crate) fn chains(command: &str) -> bool {
    command.contains("&&") || command.contains(';') || command.contains('|')
}

/// The error a placeholder verify command gives for `label`.
///
/// Implements: rust-lint/lint-verify-commands
pub(crate) fn placeholder_error(label: &str) -> String {
    format!(
        "{label} verify is the template placeholder {PLACEHOLDER_COMMAND}; replace it with a \
         real command that verifies the completed change's final tree"
    )
}

/// The error a verify command naming no declared script gives for `label`.
///
/// Implements: rust-lint/lint-verify-commands
pub(crate) fn missing_script_error(label: &str, script: &str) -> String {
    format!(
        "{label} verify references package script \"{script}\" that is not defined in the root \
         package.json"
    )
}

/// The warning an unresolved verify command gives for `label`.
///
/// Implements: rust-lint/lint-verify-commands
pub(crate) fn unresolved_warning(label: &str, command: &str) -> String {
    format!(
        "{label} verify names neither an existing repository path nor a package script: \
         \"{command}\""
    )
}

/// The script names the root `package.json` declares, or none when it does not
/// parse or holds no `scripts` object.
fn package_scripts(root: &Path) -> HashSet<String> {
    let Ok(text) = fs::read_to_string(root.join(PACKAGE_JSON)) else {
        return HashSet::new();
    };
    let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&text) else {
        return HashSet::new();
    };
    manifest
        .get("scripts")
        .and_then(serde_json::Value::as_object)
        .map_or_else(HashSet::new, |scripts| scripts.keys().cloned().collect())
}

/// The paths that give the project's languages: tracked files when the project
/// root is the repository's top folder, then the manifests at the root.
fn project_paths(root: &Path) -> Vec<String> {
    let mut paths = Vec::new();
    let vcs = GitVcs::new(root);
    if vcs
        .root()
        .ok()
        .flatten()
        .is_some_and(|found| same_root(root, &found))
        && let Ok(endings) = vcs.line_endings()
    {
        paths.extend(endings.into_iter().map(|entry| entry.path));
    }
    for manifest in ROOT_MANIFESTS {
        if root.join(manifest).is_file() {
            paths.push(manifest.to_owned());
        }
    }
    paths
}

/// True when two roots name the same folder once both resolve.
// The tracked paths cannot change the Rust language a lint run sees, because the
// link gates refuse a root without `Cargo.toml`; both outcomes are equivalent.
// Only docs.rs sets `docsrs`, so the marker needs no crate in any build here.
#[cfg_attr(docsrs, mutants::skip)]
fn same_root(root: &Path, found: &Path) -> bool {
    match (fs::canonicalize(root), fs::canonicalize(found)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

/// The last slash-separated part of a path, or the path itself without one.
fn last_part(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// Splits a command at whitespace outside quotes, dropping the quote characters.
fn tokenize(command: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut has_content = false;
    for character in command.chars() {
        if let Some(open) = quote {
            if character == open {
                quote = None;
            } else {
                current.push(character);
            }
            continue;
        }
        if character == '"' || character == '\'' {
            quote = Some(character);
            has_content = true;
            continue;
        }
        if is_space(character) {
            if has_content {
                tokens.push(std::mem::take(&mut current));
                has_content = false;
            }
            continue;
        }
        current.push(character);
        has_content = true;
    }
    if has_content {
        tokens.push(current);
    }
    tokens
}

/// True when the tokens are `node`, `-e` or `--eval`, and the sentinel
/// expression under the spec's normalizations.
fn is_placeholder(tokens: &[String]) -> bool {
    let [node, flag, expression] = tokens else {
        return false;
    };
    node == "node"
        && (flag == "-e" || flag == "--eval")
        && normalized_expression(expression) == "process.exit(0)"
}

/// The sentinel expression after trimming, dropping trailing semicolons and
/// removing whitespace.
fn normalized_expression(expression: &str) -> String {
    expression
        .trim_matches(is_space)
        .trim_end_matches(';')
        .chars()
        .filter(|character| !is_space(*character))
        .collect()
}

/// The package script a command invokes, or none when it invokes no script.
fn package_script(tokens: &[String]) -> Option<String> {
    let binary = tokens.first()?;
    if !PACKAGE_MANAGER_BINARIES.contains(&binary.as_str()) {
        return None;
    }
    let first = tokens.get(1)?;
    if first.starts_with('-') {
        return None;
    }
    if PACKAGE_RUN_VERBS.contains(&first.as_str()) {
        let second = tokens.get(2)?;
        return (!second.starts_with('-')).then(|| second.clone());
    }
    if PACKAGE_MANAGER_SUBCOMMANDS.contains(&first.as_str()) {
        return None;
    }
    Some(first.clone())
}

/// True when the command starts with the Rust verify runner.
fn is_runner(tokens: &[String], rust: bool) -> bool {
    let [binary, subcommand, ..] = tokens else {
        return false;
    };
    rust && binary == "cargo" && CARGO_RUNNERS.contains(&subcommand.as_str())
}

/// True when any token names an existing file or folder under the root.
fn names_existing_path(root: &Path, tokens: &[String]) -> bool {
    tokens.iter().enumerate().any(|(index, token)| {
        token_names_path(token, index) && fs::metadata(root.join(token)).is_ok()
    })
}

/// True when a token can name a repository path.
fn token_names_path(token: &str, index: usize) -> bool {
    if token.is_empty() || token.starts_with('-') || token.starts_with('/') {
        return false;
    }
    if token.contains('=') || has_url_scheme(token) {
        return false;
    }
    index != 0 || token.contains('/') || token.contains('\\')
}

/// True when a token starts with a URL scheme.
fn has_url_scheme(token: &str) -> bool {
    let Some((scheme, _)) = token.split_once("://") else {
        return false;
    };
    let mut characters = scheme.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    first.is_ascii_alphabetic()
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '.' | '-')
        })
}

/// True for JavaScript whitespace, which includes the byte order mark.
fn is_space(character: char) -> bool {
    character.is_whitespace() || character == '\u{feff}'
}
