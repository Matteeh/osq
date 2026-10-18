//! Fast golden test: the frozen living specs equal TypeScript's parse.

pub mod golden_support;

use golden_support::{
    Difference, assert_no_failures, digest, first_difference, living_entry, read_golden,
};
use osq_kernel_specs::{read_living_spec, read_sidecar};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

/// The frozen living specs, by capability name.
const FIXTURES: [&str; 3] = ["rust-core", "metrics-and-reporting", "traceability"];

/// The folder holding the frozen living specs.
fn living_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/living")
}

/// The golden entry whose `capability` is `capability`.
fn golden_for<'a>(golden: &'a Value, capability: &str) -> Option<&'a Value> {
    golden
        .as_array()?
        .iter()
        .find(|entry| entry.get("capability").and_then(Value::as_str) == Some(capability))
}

/// Covers: rust-specs/living-fixtures-match-typescript
#[test]
fn living_fixtures_match_typescript() {
    let golden = read_golden("living.json");
    let mut failures = Vec::new();
    for capability in FIXTURES {
        let folder = living_dir().join(capability);
        let (Ok(spec), Ok(sidecar)) = (
            read_living_spec(&folder.join("spec.md")),
            read_sidecar(&folder.join("osq.yml")),
        ) else {
            failures.push(format!("{capability}: the fixture does not read"));
            continue;
        };
        let actual = digest(&living_entry(capability, &spec, &sidecar));
        let Some(expected) = golden_for(&golden, capability) else {
            failures.push(format!("{capability}: no golden entry"));
            continue;
        };
        if let Some(difference) = first_difference(expected, &actual) {
            failures.push(format!("{capability}: {difference}"));
        }
    }
    assert_no_failures(&failures);
}

/// Covers: rust-specs/living-fixtures-match-typescript
#[test]
fn strings_digest_by_length_and_key() {
    let kept = "a".repeat(64);
    let value = json!({
        "kept": kept,
        "long": "a".repeat(65),
        "path": "p".repeat(65),
        "capability": "c".repeat(65),
    });
    let digested = digest(&value);
    assert_eq!(digested["kept"], Value::String("a".repeat(64)));
    assert_eq!(
        digested["long"],
        Value::String("fnv1a64:8087e9a889f8a14c".to_string())
    );
    assert_eq!(digested["path"], Value::String("p".repeat(65)));
    assert_eq!(digested["capability"], Value::String("c".repeat(65)));
}

/// Covers: rust-specs/living-fixtures-match-typescript
#[test]
fn first_difference_names_the_pointer() {
    let expected = json!({"a": [1, 2, {"b": "x"}], "c": null});
    let actual = json!({"a": [1, 2, {"b": "y"}], "c": null});
    let difference: Difference = first_difference(&expected, &actual).expect("a difference");
    assert_eq!(difference.pointer, "/a/2/b");
    assert_eq!(difference.expected, json!("x"));
    assert_eq!(difference.actual, json!("y"));
    assert!(first_difference(&expected, &expected).is_none());
}
