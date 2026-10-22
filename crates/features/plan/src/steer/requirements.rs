//! The requirements a change rewrites whose text moved on the default branch.

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_specs::{Delta, LivingSpec, parse_delta, parse_living_spec};
use osq_kernel_vcs::{GitVcs, Vcs};

/// One requirement whose text differs between the base and the branch.
pub(super) struct Changed {
    /// The capability folder the delta rewrites.
    pub(super) capability: String,
    /// The requirement's name.
    pub(super) requirement: String,
    /// The requirement's text on the branch, or none when it is gone.
    pub(super) raw: Option<String>,
}

/// Reads the changed requirements of `folder` between its base and `branch`.
///
/// # Errors
///
/// Returns the display of the first git error.
///
/// Implements: rust-plan/steering-prompt
pub(super) fn changed(
    folder: &Path,
    vcs: &GitVcs,
    branch: &str,
) -> Result<Vec<Changed>, FeatureError> {
    let base = base_commit(folder);
    let mut changed = Vec::new();
    for capability in capabilities(folder) {
        let Some(delta) = delta(folder, &capability) else {
            continue;
        };
        let names = names(&delta);
        if names.is_empty() {
            continue;
        }
        let relative = format!("openspec/specs/{capability}/spec.md");
        let base = side(vcs, base.as_deref(), &relative)?;
        let current = side(vcs, Some(branch), &relative)?;
        for name in names {
            if raw(base.as_ref(), &name) != raw(current.as_ref(), &name) {
                let text = raw(current.as_ref(), &name).map(str::to_owned);
                changed.push(Changed {
                    capability: capability.clone(),
                    requirement: name,
                    raw: text,
                });
            }
        }
    }
    Ok(changed)
}

/// The `####` blocks a `requirement_changed` trigger adds for each requirement.
///
/// Implements: rust-plan/steering-prompt
pub(super) fn lines(changed: &[Changed], branch: &str) -> Vec<String> {
    let mut lines = Vec::new();
    for entry in changed {
        lines.push(String::new());
        lines.push(format!(
            "#### {}: {} on {branch}",
            entry.capability, entry.requirement
        ));
        lines.push(String::new());
        match &entry.raw {
            Some(raw) => {
                lines.push("```".to_owned());
                lines.push(raw.clone());
                lines.push("```".to_owned());
            }
            None => lines.push(format!("Removed on {branch}.")),
        }
    }
    lines
}

/// One side of the comparison, parsed, or none when the rev has no such file.
///
/// Implements: rust-plan/steering-prompt
fn side(
    vcs: &GitVcs,
    rev: Option<&str>,
    relative: &str,
) -> Result<Option<LivingSpec>, FeatureError> {
    let Some(rev) = rev else {
        return Ok(None);
    };
    let content = vcs
        .show(rev, relative)
        .map_err(|error| FeatureError::failed("plan", error.to_string()))?;
    Ok(content.as_deref().map(parse_living_spec))
}

/// The requirement names a delta rewrites: MODIFIED, REMOVED and rename sources.
///
/// Implements: rust-plan/steering-prompt
fn names(delta: &Delta) -> Vec<String> {
    let mut names: Vec<String> = delta
        .modified
        .iter()
        .map(|requirement| requirement.name.clone())
        .collect();
    names.extend(delta.removed.iter().cloned());
    names.extend(delta.renamed.iter().map(|rename| rename.from.clone()));
    names
}

/// One capability folder's delta, or none when its spec cannot be read.
///
/// Implements: rust-plan/steering-prompt
fn delta(folder: &Path, capability: &str) -> Option<Delta> {
    let path = folder.join("specs").join(capability).join("spec.md");
    std::fs::read_to_string(path)
        .ok()
        .map(|text| parse_delta(&text))
}

/// The capability folders under the change's `specs`, sorted by name.
///
/// Implements: rust-plan/steering-prompt
fn capabilities(folder: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(folder.join("specs")) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    names
}

/// One requirement's verbatim text, or none when the spec lacks it.
///
/// Implements: rust-plan/steering-prompt
fn raw<'a>(spec: Option<&'a LivingSpec>, name: &str) -> Option<&'a str> {
    spec?
        .requirements
        .iter()
        .find(|requirement| requirement.name == name)
        .map(|requirement| requirement.raw.as_str())
}

/// The trimmed text of `.run/requirements-base`, else of `.run/base`, when not blank.
///
/// Implements: rust-plan/steering-prompt
fn base_commit(folder: &Path) -> Option<String> {
    let marker = |name: &str| {
        let text = std::fs::read_to_string(folder.join(".run").join(name)).ok()?;
        let trimmed = text.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    };
    marker("requirements-base").or_else(|| marker("base"))
}
