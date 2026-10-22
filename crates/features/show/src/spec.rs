//! The `spec` command: list living capabilities, their requirements, or print one.

use std::path::Path;

use osq_core::{FeatureError, Output};
use osq_kernel_specs::{normalize_requirement_name, read_living_spec};

/// Runs `spec` with its arguments on the project at `root`.
///
/// # Errors
///
/// Returns [`FeatureError::usage`] for more than two arguments and
/// [`FeatureError::failed`] for an unknown capability or requirement or a
/// `spec.md` that cannot be read.
///
/// Implements: rust-show/spec-command
/// Implements: rust-show/spec-arguments
pub(crate) fn run(root: &Path, args: &[String]) -> Result<Output, FeatureError> {
    if args.len() > 2 {
        return Err(FeatureError::usage(
            "spec",
            "expected [capability] [requirement]",
        ));
    }
    let capabilities = capabilities(root);
    let capability = non_empty(args.first());
    let requirement = non_empty(args.get(1));
    match capability {
        None => Ok(Output::text(lines(&capabilities))),
        Some(capability) => run_capability(root, capability, requirement, &capabilities),
    }
}

/// Runs `spec` once a capability is named, after checking the name.
///
/// Implements: rust-show/spec-command
fn run_capability(
    root: &Path,
    capability: &str,
    requirement: Option<&str>,
    capabilities: &[String],
) -> Result<Output, FeatureError> {
    if !capabilities.iter().any(|name| name == capability) {
        return Err(FeatureError::failed(
            "spec",
            format!(
                "No living capability \"{capability}\". Capabilities: {}",
                capabilities.join(", ")
            ),
        ));
    }
    let path = root
        .join("openspec")
        .join("specs")
        .join(capability)
        .join("spec.md");
    let spec =
        read_living_spec(&path).map_err(|error| FeatureError::failed("spec", error.to_string()))?;
    let Some(requirement) = requirement else {
        let names: Vec<&str> = spec
            .requirements
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        return Ok(Output::text(lines(&names)));
    };
    let wanted = normalize_requirement_name(requirement);
    spec.requirements
        .iter()
        .find(|entry| entry.name == wanted)
        .map_or_else(
            || {
                Err(FeatureError::failed(
                    "spec",
                    format!(
                        "{capability} has no requirement \"{requirement}\". \
                         osq spec {capability} lists them."
                    ),
                ))
            },
            |entry| Ok(Output::text(format!("{}\n", entry.raw))),
        )
}

/// Takes an argument only when it is present and not empty.
fn non_empty(value: Option<&String>) -> Option<&str> {
    value.map(String::as_str).filter(|text| !text.is_empty())
}

/// The names of the capability folders directly under `openspec/specs`.
///
/// Implements: rust-show/spec-command
fn capabilities(root: &Path) -> Vec<String> {
    let directory = root.join("openspec").join("specs");
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| entry.path().join("spec.md").exists())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// Joins each item onto its own line, ending with a newline.
fn lines<T: AsRef<str>>(items: &[T]) -> String {
    let mut text = String::new();
    for item in items {
        text.push_str(item.as_ref());
        text.push('\n');
    }
    text
}
