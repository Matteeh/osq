//! Assessing opencode's and claude's `--version` text for doctor.

use osq_kernel_config::Harness;

/// TypeScript's `OPENCODE_TESTED_RANGE`, held in code as it holds it (ADR 029).
const OPENCODE_TESTED_RANGE: &str = ">=2.0.0 <3.0.0";
/// TypeScript's `CLAUDE_MINIMUM_VERSION`, held in code as it holds it (ADR 029).
const CLAUDE_MINIMUM_VERSION: &str = "2.1.278";
/// The lowest opencode version the adapter supports.
const OPENCODE_MIN: [u64; 3] = [2, 0, 0];
/// The first opencode version after the tested range.
const OPENCODE_MAX: [u64; 3] = [3, 0, 0];
/// The oldest Claude Code version every flag osq passes was verified against.
const CLAUDE_MINIMUM: [u64; 3] = [2, 1, 278];

/// Builds a harness's version line, or none when it adds no such check.
///
/// Implements: rust-doctor/doctor-harness-checks
pub(super) fn line(harness: Harness, text: &str) -> Option<String> {
    match harness {
        Harness::Opencode => Some(opencode_line(text)),
        Harness::Claude => Some(claude_line(text)),
        Harness::Agy | Harness::Mock | Harness::Codex | Harness::Pi => None,
    }
}

/// Builds opencode's line from the first version run in its version text.
///
/// Implements: rust-doctor/doctor-harness-checks
fn opencode_line(text: &str) -> String {
    let (shown, at_least_minimum, tested) = match first_version(text) {
        Some(parts) => (
            version_text(parts),
            parts >= OPENCODE_MIN,
            parts >= OPENCODE_MIN && parts < OPENCODE_MAX,
        ),
        None => (text.to_owned(), true, false),
    };
    if tested {
        return format!("[ok] harness-version: opencode {shown} (tested {OPENCODE_TESTED_RANGE})");
    }
    if at_least_minimum {
        return format!(
            "[warn] harness-version: opencode {shown} is outside the tested range \
             {OPENCODE_TESTED_RANGE}"
        );
    }
    format!(
        "[fail] harness-version: opencode {shown} is not supported; the opencode adapter \
         needs opencode 2 (tested {OPENCODE_TESTED_RANGE})"
    )
}

/// Builds claude's line from the first version run in its version text.
///
/// Implements: rust-doctor/doctor-harness-checks
fn claude_line(text: &str) -> String {
    let old_enough = first_version(text).is_some_and(|parts| parts >= CLAUDE_MINIMUM);
    if old_enough {
        return format!(
            "[ok] harness-version: Claude Code {text} (minimum {CLAUDE_MINIMUM_VERSION})"
        );
    }
    format!(
        "[fail] harness-version: Claude Code {text} is below the required {CLAUDE_MINIMUM_VERSION}"
    )
}

/// Finds the first `digits.digits.digits` run and parses its three parts.
///
/// Implements: rust-doctor/doctor-harness-checks
fn first_version(text: &str) -> Option<[u64; 3]> {
    let bytes = text.as_bytes();
    for start in 0..bytes.len() {
        if bytes[start].is_ascii_digit()
            && let Some(parts) = candidate(bytes, start)
        {
            return Some(parts);
        }
    }
    None
}

/// Reads the three digit groups starting at `start` when the dots follow them.
///
/// Implements: rust-doctor/doctor-harness-checks
fn candidate(bytes: &[u8], start: usize) -> Option<[u64; 3]> {
    let rest = bytes.get(start..)?;
    let (first, rest) = digits(rest);
    let rest = rest.strip_prefix(b".")?;
    let (second, rest) = digits(rest);
    let rest = rest.strip_prefix(b".")?;
    let (third, _rest) = digits(rest);
    Some([parse_part(first)?, parse_part(second)?, parse_part(third)?])
}

/// Splits one leading run of digits from the rest of the bytes.
///
/// Implements: rust-doctor/doctor-harness-checks
fn digits(bytes: &[u8]) -> (&[u8], &[u8]) {
    let length = bytes
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count();
    bytes.split_at(length)
}

/// Parses one digit group, refusing a number too large for a `u64`.
///
/// Implements: rust-doctor/doctor-harness-checks
fn parse_part(bytes: &[u8]) -> Option<u64> {
    std::str::from_utf8(bytes).ok()?.parse().ok()
}

/// Formats one version as its three parts joined by dots.
///
/// Implements: rust-doctor/doctor-harness-checks
fn version_text(parts: [u64; 3]) -> String {
    format!("{}.{}.{}", parts[0], parts[1], parts[2])
}
