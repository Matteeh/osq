//! Parsing one pi version text and comparing it with the tested range.

use std::fmt;

/// The tested range a caller gives for pi.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PiVersionRange {
    /// The lowest tested version, as its three parts.
    pub min: [u64; 3],
    /// The first version after the tested range, as its three parts.
    pub max: [u64; 3],
}

impl fmt::Display for PiVersionRange {
    /// Writes the range as its minimum and maximum version.
    ///
    /// Implements: rust-harnesses/pi-version-assessment
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            ">={} <{}",
            version_text(self.min),
            version_text(self.max)
        )
    }
}

/// Formats one version as its three parts joined by dots.
///
/// Implements: rust-harnesses/pi-version-assessment
fn version_text(parts: [u64; 3]) -> String {
    format!("{}.{}.{}", parts[0], parts[1], parts[2])
}

/// One `pi --version` text assessed against the tested range.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PiVersionAssessment {
    /// The first line of the text, trimmed.
    pub version: String,
    /// Whether the version lies inside the tested range.
    pub tested: bool,
    /// The warning to print when it lies outside, absent when tested.
    pub warning: Option<String>,
}

/// Assesses one `pi --version` text against the tested range.
///
/// Implements: rust-harnesses/pi-version-assessment
#[must_use]
pub fn assess_pi_version(raw: &str, range: PiVersionRange) -> PiVersionAssessment {
    let version = first_line(raw);
    match parse_version(&version) {
        Some(parts) if within(parts, range) => PiVersionAssessment {
            version,
            tested: true,
            warning: None,
        },
        Some(_) => {
            let warning = format!("Pi {version} is outside the tested range {range}");
            PiVersionAssessment {
                version,
                tested: false,
                warning: Some(warning),
            }
        }
        None => {
            let warning = format!("Pi version \"{version}\" is outside the tested range {range}");
            PiVersionAssessment {
                version,
                tested: false,
                warning: Some(warning),
            }
        }
    }
}

/// Takes the trimmed first line of the text.
///
/// Implements: rust-harnesses/pi-version-assessment
fn first_line(raw: &str) -> String {
    raw.trim().lines().next().unwrap_or("").trim().to_owned()
}

/// Finds the first `digits.digits.digits` run and parses its three parts.
///
/// Implements: rust-harnesses/pi-version-assessment
fn parse_version(version: &str) -> Option<[u64; 3]> {
    let bytes = version.as_bytes();
    for start in 0..bytes.len() {
        if bytes[start].is_ascii_digit()
            && let Some(parts) = candidate(bytes, start)
        {
            return Some([
                parse_part(parts[0])?,
                parse_part(parts[1])?,
                parse_part(parts[2])?,
            ]);
        }
    }
    None
}

/// Reads the three digit groups starting at `start`, when the dots follow them.
///
/// Implements: rust-harnesses/pi-version-assessment
fn candidate(bytes: &[u8], start: usize) -> Option<[&[u8]; 3]> {
    let rest = bytes.get(start..)?;
    let (first, rest) = digits(rest);
    let rest = rest.strip_prefix(b".")?;
    let (second, rest) = digits(rest);
    let rest = rest.strip_prefix(b".")?;
    let (third, _rest) = digits(rest);
    Some([first, second, third])
}

/// Splits one leading run of digits from the rest of the bytes.
///
/// Implements: rust-harnesses/pi-version-assessment
fn digits(bytes: &[u8]) -> (&[u8], &[u8]) {
    let length = bytes
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count();
    bytes.split_at(length)
}

/// Parses one digit group, refusing a number too large for a `u64`.
///
/// Implements: rust-harnesses/pi-version-assessment
fn parse_part(bytes: &[u8]) -> Option<u64> {
    std::str::from_utf8(bytes).ok()?.parse().ok()
}

/// Whether the parts lie at least `min` and below `max`.
///
/// Implements: rust-harnesses/pi-version-assessment
fn within(parts: [u64; 3], range: PiVersionRange) -> bool {
    parts >= range.min && parts < range.max
}
