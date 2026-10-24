//! Doctor's planning-prices warning for models planning sessions recorded.
//!
//! The line is pure text; only this module reads plan records through storage
//! (ADR 022, ADR 023).

use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::path::Path;

use osq_kernel_config::Config;
use osq_kernel_storage::{Location, planning_token_models};

use super::changes::{list_folders, real_root};

/// Builds the `planning-prices` warning, or none when every model is priced.
///
/// Implements: rust-doctor/doctor-planning-prices
pub(super) fn planning_prices_line(root: &Path, config: &Config) -> Option<String> {
    let real = real_root(root);
    let mut models = BTreeSet::new();
    for entry in list_folders(&real, config) {
        if entry.location == Location::Rejected {
            continue;
        }
        for model in planning_token_models(&entry.path) {
            if !config.planning.prices.contains_key(&model) {
                models.insert(model);
            }
        }
    }
    if models.is_empty() {
        return None;
    }
    let models: Vec<String> = models.into_iter().collect();
    let names = models.join(", ");
    let keys = models
        .iter()
        .map(|model| format!("planning.prices[{}]", json_string(model)))
        .collect::<Vec<String>>()
        .join(", ");
    Some(format!(
        "[warn] planning-prices: planning cost stays unreported for {names}; add {keys}"
    ))
}

/// Writes one string as `JSON.stringify` writes it.
///
/// Implements: rust-doctor/doctor-planning-prices
fn json_string(text: &str) -> String {
    let mut out = String::from("\"");
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            control if (control as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", control as u32);
            }
            other => out.push(other),
        }
    }
    out.push('"');
    out
}
