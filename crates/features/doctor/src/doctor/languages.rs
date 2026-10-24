//! Doctor's languages line and the gates and extras each language lacks.
//!
//! The lines are pure text; only this module reads the root's manifests
//! (ADR 023). TypeScript's language presets and coverage list are data here
//! until Rust has a languages kernel (ADR 017 departure).

use std::fmt::Write as _;
use std::path::Path;

/// The one language every gate and extra covers.
const TYPESCRIPT: &str = "TypeScript/JavaScript";
/// Every language osq knows, in preset order, with its manifests.
const LANGUAGES: [(&str, &[&str]); 4] = [
    (TYPESCRIPT, &["package.json"]),
    ("Rust", &["Cargo.toml"]),
    ("Python", &["pyproject.toml"]),
    ("Go", &["go.mod"]),
];
/// The gate or extra kind: whether the entry is a gate.
const GATE: bool = true;
/// The gate or extra kind: whether the entry is an extra.
const EXTRA: bool = false;
/// Which languages each gate and extra covers, in TypeScript's list order.
const COVERAGE: [(&str, bool, &[&str]); 8] = [
    ("test-modification gate", GATE, &[TYPESCRIPT, "Rust"]),
    ("denied-dependency gate", GATE, &[TYPESCRIPT, "Rust"]),
    ("verify-command lint", EXTRA, &[TYPESCRIPT, "Rust"]),
    ("test output reading", EXTRA, &[TYPESCRIPT]),
    ("import graph", EXTRA, &[TYPESCRIPT]),
    ("traceability", EXTRA, &[TYPESCRIPT]),
    ("function ranges", EXTRA, &[TYPESCRIPT]),
    ("repository measures", EXTRA, &[TYPESCRIPT]),
];

/// Builds the `languages` line, or none when every package is TypeScript.
///
/// Implements: rust-doctor/doctor-languages
pub(super) fn languages_line(root: &Path, tracked: Option<&[String]>) -> Option<String> {
    let mut paths: Vec<&str> = tracked
        .unwrap_or_default()
        .iter()
        .map(String::as_str)
        .collect();
    let mut manifests = Vec::new();
    for (_, names) in LANGUAGES {
        for name in names {
            if root.join(name).is_file() {
                manifests.push(*name);
            }
        }
    }
    paths.extend(manifests);
    let languages: Vec<&str> = LANGUAGES
        .iter()
        .filter(|(name, _)| paths.iter().any(|path| language_of(path) == Some(*name)))
        .map(|(name, _)| *name)
        .collect();
    if languages.iter().all(|language| *language == TYPESCRIPT) {
        return None;
    }
    let mut message = languages.join(", ");
    let mut lacks_gate = false;
    for language in languages.iter().filter(|language| **language != TYPESCRIPT) {
        let (gates, extras) = uncovered(language);
        if gates.is_empty() && extras.is_empty() {
            continue;
        }
        lacks_gate |= !gates.is_empty();
        let mut parts = Vec::new();
        if !gates.is_empty() {
            parts.push(format!("gates: {}", gates.join(", ")));
        }
        if !extras.is_empty() {
            parts.push(format!("extras: {}", extras.join(", ")));
        }
        let _ = write!(message, ". {language} lacks {}", parts.join("; "));
    }
    let status = if lacks_gate { "[warn]" } else { "[ok]" };
    Some(format!("{status} languages: {message}"))
}

/// The language a path's manifest makes its folder a package of.
///
/// Implements: rust-doctor/doctor-languages
fn language_of(path: &str) -> Option<&'static str> {
    let name = Path::new(path).file_name()?.to_str()?;
    LANGUAGES
        .iter()
        .find(|(_, manifests)| manifests.contains(&name))
        .map(|(language, _)| *language)
}

/// The gates and extras that do not cover a language, each in list order.
///
/// Implements: rust-doctor/doctor-languages
fn uncovered(language: &str) -> (Vec<&'static str>, Vec<&'static str>) {
    let mut gates = Vec::new();
    let mut extras = Vec::new();
    for (name, kind, covers) in COVERAGE {
        if covers.contains(&language) {
            continue;
        }
        if kind == GATE {
            gates.push(name);
        } else {
            extras.push(name);
        }
    }
    (gates, extras)
}
