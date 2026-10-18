//! Typed values the Markdown parsers return.

use serde::Serialize;
use std::collections::BTreeMap;

/// One requirement block of a living or delta spec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Requirement {
    /// The normalized requirement name.
    pub name: String,
    /// The trimmed body between the header and the first scenario.
    pub body: String,
    /// The scenarios in document order.
    pub scenarios: Vec<Scenario>,
    /// The whole block with normalized line endings and no trailing whitespace.
    pub raw: String,
}

/// One `####` scenario block of a requirement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Scenario {
    /// The scenario name without its header prefix or closing hashes.
    pub name: String,
    /// The text of every `WHEN` bullet.
    pub when: Vec<String>,
    /// The text of every `THEN` bullet.
    pub then: Vec<String>,
    /// Every `THEN` and `AND` outcome, in document order.
    pub outcomes: Vec<Outcome>,
    /// The whole block with normalized line endings and no trailing whitespace.
    pub raw: String,
}

/// One `THEN` or `AND` outcome, with its table when one follows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Outcome {
    /// The trimmed outcome text.
    pub text: String,
    /// The table rows below the outcome, keyed by the header cells.
    pub rows: Option<Vec<BTreeMap<String, String>>>,
}

/// A living capability spec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LivingSpec {
    /// The title from the first `#` line.
    pub title: String,
    /// The trimmed purpose, or empty text.
    pub purpose: String,
    /// The requirement blocks of the first Requirements section.
    pub requirements: Vec<Requirement>,
    /// The globs of the Code ownership requirement.
    pub code_ownership: Vec<String>,
}

/// A delta spec's four operations and its purpose.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Delta {
    /// The title without a leading `Spec Delta:`.
    pub title: String,
    /// The trimmed purpose, or empty text.
    pub purpose: String,
    /// The requirement blocks under ADDED sections.
    pub added: Vec<Requirement>,
    /// The requirement blocks under MODIFIED sections.
    pub modified: Vec<Requirement>,
    /// The requirement names under REMOVED sections.
    pub removed: Vec<String>,
    /// The paired renames under RENAMED sections.
    pub renamed: Vec<Rename>,
    /// The malformed rename lines, kept trimmed.
    pub invalid_renames: Vec<String>,
    /// The FROM and TO sides without a partner.
    pub unpaired_renames: Vec<UnpairedRename>,
}

/// One rename pair of a RENAMED section.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Rename {
    /// The old requirement name.
    pub from: String,
    /// The new requirement name.
    pub to: String,
}

/// One side of a rename that has no partner.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UnpairedRename {
    /// Whether this is the FROM or the TO side.
    pub side: RenameSide,
    /// The requirement name on that side.
    pub name: String,
}

/// The side of a rename pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum RenameSide {
    /// The side named `FROM`.
    #[serde(rename = "FROM")]
    From,
    /// The side named `TO`.
    #[serde(rename = "TO")]
    To,
}
