//! Validation of the ADRs a decisions folder reads.

use super::{Adr, AppliesTo, DecisionRecords};
use serde::Serialize;
use std::collections::BTreeSet;
use std::fmt;

/// The stable code of one decision finding.
///
/// A code serializes as its kebab-case string, and `fix` gives the one fix the
/// code prescribes for a human (ADR 026).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum DecisionCode {
    /// A list field is present but is not a list of non-empty strings.
    #[serde(rename = "malformed-list")]
    MalformedList,
    /// The status is not proposed, accepted or superseded.
    #[serde(rename = "invalid-status")]
    InvalidStatus,
    /// An accepted ADR names no capabilities.
    #[serde(rename = "missing-applies-to")]
    MissingAppliesTo,
    /// An accepted ADR has no rule.
    #[serde(rename = "missing-rule")]
    MissingRule,
    /// An accepted ADR's rule spans more than one line.
    #[serde(rename = "multiline-rule")]
    MultilineRule,
    /// An accepted ADR's rule is longer than the configured limit.
    #[serde(rename = "long-rule")]
    LongRule,
    /// A superseded ADR names no replacement.
    #[serde(rename = "missing-superseded-by")]
    MissingSupersededBy,
    /// A superseded ADR names a replacement that does not exist.
    #[serde(rename = "unknown-superseded-by")]
    UnknownSupersededBy,
    /// `applies_to` names a capability without a living spec.
    #[serde(rename = "unknown-capability")]
    UnknownCapability,
    /// `applies_to` names a group no living capability sets.
    #[serde(rename = "unknown-group")]
    UnknownGroup,
    /// A Markdown file in the decisions folder is not an ADR.
    #[serde(rename = "ignored-file")]
    IgnoredFile,
}

impl DecisionCode {
    /// The code as its kebab-case string.
    ///
    /// Implements: rust-specs/adr-validation
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MalformedList => "malformed-list",
            Self::InvalidStatus => "invalid-status",
            Self::MissingAppliesTo => "missing-applies-to",
            Self::MissingRule => "missing-rule",
            Self::MultilineRule => "multiline-rule",
            Self::LongRule => "long-rule",
            Self::MissingSupersededBy => "missing-superseded-by",
            Self::UnknownSupersededBy => "unknown-superseded-by",
            Self::UnknownCapability => "unknown-capability",
            Self::UnknownGroup => "unknown-group",
            Self::IgnoredFile => "ignored-file",
        }
    }

    /// The one fix the code prescribes, as the fix table gives it.
    ///
    /// Implements: rust-specs/adr-validation
    #[must_use]
    pub fn fix(&self) -> &'static str {
        match self {
            Self::MalformedList => "Write the field as a list of non-empty strings, or remove it.",
            Self::InvalidStatus => "Set status to proposed, accepted or superseded.",
            Self::MissingAppliesTo => "Set applies_to to `all` or to a list of capability names.",
            Self::MissingRule => "Add a one-line rule that says what a spec must do.",
            Self::MultilineRule => "Write the rule on one line.",
            Self::LongRule => {
                "Shorten the rule to the limit and keep the full wording in the body."
            }
            Self::MissingSupersededBy => {
                "Set superseded_by to the number of the ADR that replaces this one."
            }
            Self::UnknownSupersededBy => "Name an existing ADR's number in superseded_by.",
            Self::UnknownCapability => "Name a living capability, or add its spec first.",
            Self::UnknownGroup => "Name a group that a living capability's `osq.yml` sets.",
            Self::IgnoredFile => {
                "Give the file a numbered name and frontmatter with a status, or move it out of \
                 the decisions folder."
            }
        }
    }
}

/// One problem validation found in the decisions folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DecisionFinding {
    /// The stable code of the finding.
    pub code: DecisionCode,
    /// The record's path the finding concerns.
    pub file: String,
    /// The message TypeScript's validator reports.
    pub message: String,
    /// The one fix for the human, taken from the code.
    pub fix: String,
}

impl DecisionFinding {
    /// Builds a finding for `file`, taking its fix from `code`.
    fn new(code: DecisionCode, file: &str, message: String) -> Self {
        let fix = code.fix().to_string();
        Self {
            code,
            file: file.to_string(),
            message,
            fix,
        }
    }
}

impl fmt::Display for DecisionFinding {
    /// Writes the finding as `<file>: <message>`.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.file, self.message)
    }
}

/// The errors and warnings of one validation run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DecisionProblems {
    /// The problems that block.
    pub errors: Vec<DecisionFinding>,
    /// The problems that only warn.
    pub warnings: Vec<DecisionFinding>,
}

/// Validates the ADRs of `records` against the living capabilities and rule limit.
///
/// Implements: rust-specs/adr-validation
#[must_use]
pub fn validate_decisions(
    records: &DecisionRecords,
    living: &[String],
    max_rule_length: usize,
) -> DecisionProblems {
    let living: BTreeSet<&str> = living.iter().map(String::as_str).collect();
    let living_groups = living_groups(records, &living);
    let numbers: Vec<&str> = records.adrs.iter().map(|adr| adr.number.as_str()).collect();
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for adr in &records.adrs {
        validate_malformed(adr, &mut errors);
        if !matches!(adr.status.as_str(), "proposed" | "accepted" | "superseded") {
            errors.push(DecisionFinding::new(
                DecisionCode::InvalidStatus,
                &adr.path,
                "status must be proposed, accepted, or superseded".to_string(),
            ));
            continue;
        }
        if adr.status == "accepted" {
            validate_accepted(adr, max_rule_length, &mut errors);
        }
        if adr.status == "superseded" {
            validate_superseded(adr, &numbers, &mut errors);
        }
        warn_unknown_capabilities(adr, &living, &living_groups, &mut warnings);
    }

    for path in &records.ignored {
        warnings.push(DecisionFinding::new(
            DecisionCode::IgnoredFile,
            path,
            "no osq frontmatter, ignored".to_string(),
        ));
    }

    DecisionProblems { errors, warnings }
}

/// Adds one error for each malformed list field of `adr`.
fn validate_malformed(adr: &Adr, errors: &mut Vec<DecisionFinding>) {
    for field in &adr.malformed {
        let message = if field == "enforced_by" {
            "enforced_by must be a non-empty string or a list of non-empty strings".to_string()
        } else {
            format!("{field} must be a list of non-empty strings")
        };
        errors.push(DecisionFinding::new(
            DecisionCode::MalformedList,
            &adr.path,
            message,
        ));
    }
}

/// Adds the errors of an accepted ADR's `applies_to` and rule.
fn validate_accepted(adr: &Adr, max_rule_length: usize, errors: &mut Vec<DecisionFinding>) {
    if adr.applies_to.is_none() {
        errors.push(DecisionFinding::new(
            DecisionCode::MissingAppliesTo,
            &adr.path,
            "accepted ADR needs applies_to, either \"all\" or capabilities".to_string(),
        ));
    }
    if adr.rule.is_empty() {
        errors.push(DecisionFinding::new(
            DecisionCode::MissingRule,
            &adr.path,
            "accepted ADR needs a one-line rule".to_string(),
        ));
    } else if adr.rule.contains('\n') {
        errors.push(DecisionFinding::new(
            DecisionCode::MultilineRule,
            &adr.path,
            "rule must be one line".to_string(),
        ));
    } else if adr.rule.encode_utf16().count() > max_rule_length {
        errors.push(DecisionFinding::new(
            DecisionCode::LongRule,
            &adr.path,
            format!("rule is longer than limits.maxRuleLength ({max_rule_length})"),
        ));
    }
}

/// Adds the error of a superseded ADR's missing or unknown replacement.
fn validate_superseded(adr: &Adr, numbers: &[&str], errors: &mut Vec<DecisionFinding>) {
    let Some(replacement) = adr.superseded_by.as_deref() else {
        errors.push(DecisionFinding::new(
            DecisionCode::MissingSupersededBy,
            &adr.path,
            "superseded ADR needs superseded_by naming its replacement".to_string(),
        ));
        return;
    };
    if !numbers
        .iter()
        .any(|number| same_adr_number(number, replacement))
    {
        errors.push(DecisionFinding::new(
            DecisionCode::UnknownSupersededBy,
            &adr.path,
            format!("superseded_by {replacement} names no existing ADR"),
        ));
    }
}

/// Adds a warning for each capability or group entry with no living capability.
fn warn_unknown_capabilities(
    adr: &Adr,
    living: &BTreeSet<&str>,
    living_groups: &BTreeSet<&str>,
    warnings: &mut Vec<DecisionFinding>,
) {
    let Some(AppliesTo::Capabilities(entries)) = &adr.applies_to else {
        return;
    };
    for entry in entries {
        match group_entry(entry) {
            Some(group) => {
                if !living_groups.contains(group) {
                    warnings.push(DecisionFinding::new(
                        DecisionCode::UnknownGroup,
                        &adr.path,
                        format!("applies_to group \"{group}\" has no living capability"),
                    ));
                }
            }
            None => {
                if !living.contains(entry.as_str()) {
                    warnings.push(DecisionFinding::new(
                        DecisionCode::UnknownCapability,
                        &adr.path,
                        format!("applies_to capability \"{entry}\" has no living spec"),
                    ));
                }
            }
        }
    }
}

/// The name a `group:<name>` entry names, or none for a capability name.
fn group_entry(entry: &str) -> Option<&str> {
    entry.strip_prefix("group:").filter(|name| !name.is_empty())
}

/// The groups of the capabilities in `living`.
fn living_groups<'a>(records: &'a DecisionRecords, living: &BTreeSet<&str>) -> BTreeSet<&'a str> {
    records
        .groups
        .iter()
        .filter(|(capability, _)| living.contains(capability.as_str()))
        .map(|(_, group)| group.as_str())
        .collect()
}

/// True when two written ADR numbers name the same ADR by numeric value.
fn same_adr_number(left: &str, right: &str) -> bool {
    match (number_value(left), number_value(right)) {
        (Some(left_value), Some(right_value)) => left_value == right_value,
        _ => left == right,
    }
}

/// The numeric value of text parsed like `parseInt(value, 10)`, sign kept.
fn number_value(text: &str) -> Option<String> {
    let text = text.trim_start();
    let (negative, rest) = if let Some(rest) = text.strip_prefix('-') {
        (true, rest)
    } else if let Some(rest) = text.strip_prefix('+') {
        (false, rest)
    } else {
        (false, text)
    };
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return None;
    }
    let digits = digits.trim_start_matches('0');
    let digits = if digits.is_empty() { "0" } else { digits };
    let sign = if negative && digits != "0" { "-" } else { "" };
    Some(format!("{sign}{digits}"))
}
