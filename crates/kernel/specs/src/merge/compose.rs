//! The write back and the two merge entry points.

use super::apply::{
    BlockMap, MergeContext, apply_additions, apply_modifications, apply_removals, apply_renames,
    validate_delta,
};
use super::base::{RequirementSection, build_spec_skeleton, extract_requirements_section};
use super::error::MergeError;
use crate::markdown::living::parse_living_spec;
use crate::markdown::text::{fence_mask, js_trim, js_trim_end};
use crate::markdown::types::Delta;
use std::collections::HashSet;

/// Merges one parsed delta into a base spec, byte for byte as `mergeDelta` does.
///
/// A base that is none or only whitespace starts from a fresh skeleton built
/// from the capability and the delta's purpose.
///
/// # Errors
///
/// Returns the `MergeError` of the first refusal the delta makes.
///
/// Implements: rust-specs/delta-merge
pub fn merge_delta(
    base: Option<&str>,
    capability: &str,
    delta: &Delta,
) -> Result<String, MergeError> {
    validate_delta(delta, capability)?;

    let has_base = base.is_some_and(|text| !js_trim(text).is_empty());
    if !has_base {
        if let Some(requirement) = delta.modified.first() {
            return Err(MergeError::ModifiedMissing {
                capability: capability.to_string(),
                requirement: requirement.name.clone(),
            });
        }
        if let Some(rename) = delta.renamed.first() {
            return Err(MergeError::RenameWithoutBase {
                capability: capability.to_string(),
                requirement: rename.from.clone(),
            });
        }
    }

    let target = match base {
        Some(text) if has_base => text.to_string(),
        _ => build_spec_skeleton(capability, &delta.purpose),
    };
    let parts = extract_requirements_section(&target);
    let order: Vec<String> = parts
        .blocks
        .iter()
        .map(|block| block.name.clone())
        .collect();
    let mut context = MergeContext {
        capability: capability.to_string(),
        blocks: BlockMap::new(parts.blocks.clone()),
        order,
    };

    apply_renames(&mut context, &delta.renamed)?;
    if has_base {
        apply_removals(&mut context, &delta.removed)?;
    }
    apply_modifications(&mut context, &delta.modified)?;
    apply_additions(&mut context, &delta.added)?;

    Ok(recompose(&parts, &context))
}

/// Merges one parsed delta and gives none when the text holds no requirement.
///
/// # Errors
///
/// Returns the `MergeError` of the first refusal the delta makes.
///
/// Implements: rust-specs/delta-merge
pub fn merge_living_spec(
    base: Option<&str>,
    capability: &str,
    delta: &Delta,
) -> Result<Option<String>, MergeError> {
    let merged = merge_delta(base, capability, delta)?;
    if parse_living_spec(&merged).requirements.is_empty() {
        Ok(None)
    } else {
        Ok(Some(merged))
    }
}

/// Writes the base's slices and the surviving blocks back into one text.
fn recompose(parts: &RequirementSection, context: &MergeContext) -> String {
    let mut kept: Vec<&str> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    for key in context.order.iter().take(parts.blocks.len()) {
        if let Some(block) = context.blocks.get(key) {
            kept.push(&block.raw);
            seen.insert(key.as_str());
        }
    }
    for block in context.blocks.iter() {
        if !seen.contains(block.name.as_str()) {
            kept.push(&block.raw);
        }
    }

    let mut body_parts: Vec<&str> = Vec::new();
    if !js_trim(&parts.preamble).is_empty() {
        body_parts.push(js_trim_end(&parts.preamble));
    }
    body_parts.extend(kept.iter().copied());
    let body = js_trim_end(&body_parts.join("\n\n")).to_string();

    let slices = [
        js_trim_end(&parts.before),
        parts.header_line.as_str(),
        body.as_str(),
        js_trim(&parts.after),
    ];
    let joined = slices
        .iter()
        .filter(|slice| !slice.is_empty())
        .copied()
        .collect::<Vec<&str>>()
        .join("\n\n");
    format!("{}\n", js_trim_end(&collapse_blank_runs(&joined)))
}

/// Collapses runs of blank lines outside code fences into one blank line.
fn collapse_blank_runs(content: &str) -> String {
    let lines: Vec<&str> = content.split('\n').collect();
    let mask = fence_mask(&lines);
    let mut kept: Vec<&str> = Vec::new();
    let mut blank_run = 0;
    for (index, line) in lines.iter().enumerate() {
        if mask[index] {
            blank_run = 0;
            kept.push(line);
            continue;
        }
        if line.is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
            kept.push(line);
            continue;
        }
        blank_run = 0;
        kept.push(line);
    }
    kept.join("\n")
}
