//! Splitting a document into its YAML frontmatter and its body.

use super::types::{Frontmatter, SyntaxError};
use super::yaml::parse_mapping;
use yaml_rust2::yaml::Hash;

/// Splits a document that starts with `---` into its parsed frontmatter and body.
///
/// A document that does not start with `---` and a line break has an empty
/// frontmatter and the whole text as its body.
///
/// # Errors
///
/// Returns a `SyntaxError` when the frontmatter's YAML does not parse or is not
/// a mapping.
///
/// Implements: rust-specs/frontmatter
pub fn parse_frontmatter(text: &str) -> Result<Frontmatter, SyntaxError> {
    match split(text) {
        Some((yaml, body)) => Ok(Frontmatter {
            data: parse_mapping(yaml)?,
            body: body.to_string(),
        }),
        None => Ok(Frontmatter {
            data: Hash::new(),
            body: text.to_string(),
        }),
    }
}

/// Splits off the leading `---` block, without parsing its YAML.
fn split(text: &str) -> Option<(&str, &str)> {
    let rest = text
        .strip_prefix("---\n")
        .or_else(|| text.strip_prefix("---\r\n"))?;
    let index = rest.find("\n---")?;
    let before = &rest[..index];
    let yaml = before.strip_suffix('\r').unwrap_or(before);
    let after = &rest[index + 4..];
    let body = after
        .strip_prefix("\r\n")
        .or_else(|| after.strip_prefix('\n'))
        .unwrap_or(after);
    Some((yaml, body))
}
