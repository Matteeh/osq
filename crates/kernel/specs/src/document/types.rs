//! Typed values the document parsers return.

use serde::Serialize;
use yaml_rust2::yaml::Hash;

/// A document split into its YAML frontmatter and its body.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frontmatter {
    /// The parsed YAML mapping; empty when the document has no frontmatter.
    pub data: Hash,
    /// The text after the frontmatter, or the whole text without one.
    pub body: String,
}

/// A YAML syntax error, at its 1-based line in the parsed text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyntaxError {
    /// The 1-based line the error points at.
    pub line: usize,
    /// What went wrong.
    pub message: String,
}

/// A proposal's frontmatter fields and body sections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Proposal {
    /// The trimmed `title`.
    pub title: String,
    /// The `depends_on` change ids, numeric ones padded to three digits.
    pub depends_on: Vec<String>,
    /// The `fixes` change ids, numeric ones padded to three digits.
    pub fixes: Vec<String>,
    /// The `features.reads` list, or empty without one.
    pub reads: Vec<String>,
    /// The trimmed `## Goal` section.
    pub goal: String,
    /// The trimmed `## Contract` section.
    pub contract: String,
    /// The number of Markdown tables in the contract.
    pub contract_tables: usize,
    /// The trimmed `## Non-goals` section.
    pub non_goals: String,
    /// The trimmed `## Delta` section.
    pub delta: String,
    /// The trimmed `verify` field.
    pub verify: String,
}

/// A task file's frontmatter fields and acceptance lines.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TaskFile {
    /// The trimmed `title`.
    pub title: String,
    /// The trimmed `verify`.
    pub verify: String,
    /// The `scope` list.
    pub scope: Vec<String>,
    /// The `entry` list.
    pub entry: Vec<String>,
    /// The `skills` list.
    pub skills: Vec<String>,
    /// Whether the task may change preexisting tests.
    pub tests_modify: bool,
    /// The declared state the task's verify starts in.
    pub verify_starts: VerifyStarts,
    /// The acceptance lines, their text trimmed.
    pub acceptance: Vec<String>,
}

/// The declared state a task's verify starts in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VerifyStarts {
    /// The verify fails before the work.
    Red,
    /// The verify passes before the work.
    Green,
    /// Either is acceptable.
    Any,
}

/// One checklist item of a `tasks.md`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChecklistItem {
    /// The item's number, or none when it is unnumbered.
    pub number: Option<u32>,
    /// The item's title, with trailing whitespace removed.
    pub title: String,
    /// Whether the item is checked.
    pub checked: bool,
    /// The `##` section the item sits under, or none.
    pub section: Option<String>,
    /// The item's 1-based line in the file.
    pub line: usize,
}

/// A parsed `osq.yml` sidecar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Sidecar {
    /// The trimmed group.
    pub group: String,
    /// The trimmed tags, or none when the sidecar has no `tags` key.
    pub tags: Option<Vec<String>>,
}

/// Why a sidecar did not parse.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum SidecarError {
    /// The YAML did not parse.
    Syntax(SyntaxError),
    /// The YAML parsed but its fields are wrong.
    Problems(Vec<String>),
}
