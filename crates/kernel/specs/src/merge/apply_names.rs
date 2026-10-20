//! The name and scenario helpers the delta checks use.

use crate::markdown::scenario::{parse_scenario, starts_scenario};
use crate::markdown::text::{
    fence_mask, is_js_whitespace, js_trim, normalize_line_endings, normalize_requirement_name,
};
use std::collections::HashMap;

/// A block with normalized line endings and surrounding whitespace removed.
pub(crate) fn normalize_block_raw(raw: &str) -> String {
    js_trim(&normalize_line_endings(raw)).to_string()
}

/// A requirement name folded for typo detection: lowercased, single-spaced.
pub(crate) fn fold_requirement_name(name: &str) -> String {
    let normalized = normalize_requirement_name(name).to_lowercase();
    let mut folded = String::with_capacity(normalized.len());
    let mut in_run = false;
    for character in normalized.chars() {
        if is_js_whitespace(character) {
            if !in_run {
                folded.push(' ');
                in_run = true;
            }
        } else {
            folded.push(character);
            in_run = false;
        }
    }
    folded
}

/// The scenario names of a verbatim block, multiplicity preserved.
pub(crate) fn scenario_names(raw: &str) -> Vec<String> {
    let normalized = normalize_line_endings(raw);
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mask = fence_mask(&lines);
    lines
        .iter()
        .enumerate()
        .filter(|(index, line)| !mask[*index] && starts_scenario(line))
        .map(|(_, line)| parse_scenario(line).name)
        .collect()
}

/// Names present in the current block more often than in the incoming one.
pub(crate) fn missing_scenario_names(current_raw: &str, incoming_raw: &str) -> Vec<String> {
    let mut remaining: HashMap<String, usize> = HashMap::new();
    for name in scenario_names(incoming_raw) {
        *remaining.entry(name).or_insert(0) += 1;
    }
    let mut missing = Vec::new();
    for name in scenario_names(current_raw) {
        match remaining.get_mut(&name) {
            Some(count) if *count > 0 => *count -= 1,
            _ => missing.push(name),
        }
    }
    missing
}
