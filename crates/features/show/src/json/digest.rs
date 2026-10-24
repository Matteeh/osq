//! The JSON approval digest of one unapproved change.

use crate::digest::{Digest, DigestCapability, DigestDecision, DigestTask, Flag, build};
use crate::model::Change;

use super::value::Value;

/// The digest object, or `null` for an approved change.
/// Implements: rust-show/show-json
pub(super) fn value(change: &Change) -> Value {
    let Some(built) = build(change) else {
        return Value::Null;
    };
    digest(&built.digest, &built.flags)
}

/// One digest object with its flags last.
/// Implements: rust-show/show-json
fn digest(digest: &Digest, flags: &[Flag]) -> Value {
    Value::object(vec![
        ("change", Value::string(digest.change.clone())),
        ("goal", Value::string(digest.goal.clone())),
        ("tasks", rows(&digest.tasks)),
        ("capabilities", capabilities(&digest.capabilities)),
        ("decisions", decisions(&digest.decisions)),
        ("humanSteps", Value::string(digest.human_steps.clone())),
        (
            "beforeApproval",
            Value::string(digest.before_approval.clone()),
        ),
        ("flags", flag_values(flags)),
    ])
}

/// The digest's task rows.
/// Implements: rust-show/show-json
fn rows(tasks: &[DigestTask]) -> Value {
    Value::Array(
        tasks
            .iter()
            .map(|task| {
                Value::object(vec![
                    ("number", Value::string(task.number.clone())),
                    ("title", Value::string(task.title.clone())),
                    ("scopeFiles", Value::number(scope_files(task.scope_files))),
                    ("testsModify", Value::Bool(task.tests_modify)),
                    ("existingTests", Value::strings(&task.existing_tests)),
                ])
            })
            .collect(),
    )
}

/// A file count as the 64-bit float JavaScript holds.
/// Implements: rust-show/show-json
fn scope_files(count: usize) -> f64 {
    u32::try_from(count).map_or(f64::from(u32::MAX), f64::from)
}

/// The digest's written capabilities.
/// Implements: rust-show/show-json
fn capabilities(capabilities: &[DigestCapability]) -> Value {
    Value::Array(
        capabilities
            .iter()
            .map(|capability| {
                Value::object(vec![
                    ("name", Value::string(capability.name.clone())),
                    ("added", Value::strings(&capability.added)),
                    ("modified", Value::strings(&capability.modified)),
                    ("removed", Value::strings(&capability.removed)),
                    ("creates", Value::Bool(capability.creates)),
                ])
            })
            .collect(),
    )
}

/// The digest's governing decisions.
/// Implements: rust-show/show-json
fn decisions(decisions: &[DigestDecision]) -> Value {
    Value::Array(
        decisions
            .iter()
            .map(|decision| {
                Value::object(vec![
                    ("number", Value::string(decision.number.clone())),
                    ("rule", Value::string(decision.rule.clone())),
                ])
            })
            .collect(),
    )
}

/// The digest's flags.
/// Implements: rust-show/show-json
fn flag_values(flags: &[Flag]) -> Value {
    Value::Array(
        flags
            .iter()
            .map(|flag| {
                Value::object(vec![
                    ("id", Value::string(flag.id)),
                    ("label", Value::string(flag.label.clone())),
                    ("excerpt", Value::string(flag.excerpt.clone())),
                ])
            })
            .collect(),
    )
}
