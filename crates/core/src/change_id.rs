//! Reading the change id a human gives a Rust command.
//!
//! [`parse_change_id`] is pure and does no IO, so every feature resolves an id
//! through this module and keeps no matcher of its own (ADR 022).
//!
//! Implements: rust-core/change-ids

use std::fmt;

/// A change id read from a human's input.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ChangeId {
    /// The change's number, holding the trimmed digits.
    Number(String),
    /// The change's full folder name, holding the trimmed name.
    Folder(String),
    /// The change's folder name without its number, holding the trimmed name.
    Slug(String),
}

impl ChangeId {
    /// Whether this id names the change folder called `folder`.
    ///
    /// Implements: rust-core/change-ids
    #[must_use]
    pub fn names(&self, folder: &str) -> bool {
        match self {
            Self::Number(number) => names_number(number, folder),
            Self::Folder(name) => folder == name,
            Self::Slug(slug) => names_slug(slug, folder),
        }
    }
}

/// Why an input is not a change id.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChangeIdError {
    /// The input as the human gave it.
    input: String,
    /// Whether a slug was accepted.
    slug: bool,
}

impl fmt::Display for ChangeIdError {
    /// Writes the error's message, naming the accepted forms.
    ///
    /// Implements: rust-core/change-ids
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let input = &self.input;
        let forms = if self.slug {
            "give the change's number, such as 7 or 007, its full folder name, or that name without its number"
        } else {
            "give the change's number, such as 7 or 007, or its full folder name"
        };
        write!(formatter, "\"{input}\" is not a change id; {forms}")
    }
}

impl std::error::Error for ChangeIdError {}

/// Reads a human's input as a change id.
///
/// # Errors
///
/// Returns [`ChangeIdError`] naming the input as given when, after trimming,
/// it is neither a run of ASCII digits nor a name.
///
/// Implements: rust-core/change-ids
pub fn parse_change_id(input: &str, slug: bool) -> Result<ChangeId, ChangeIdError> {
    let trimmed = input.trim();
    if is_digits(trimmed) {
        return Ok(ChangeId::Number(trimmed.to_owned()));
    }
    if is_name(trimmed) {
        let id = if slug {
            ChangeId::Slug(trimmed.to_owned())
        } else {
            ChangeId::Folder(trimmed.to_owned())
        };
        return Ok(id);
    }
    Err(ChangeIdError {
        input: input.to_owned(),
        slug,
    })
}

/// Whether `text` is one or more ASCII digits.
fn is_digits(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit())
}

/// Whether `text` is a name: one or more parts joined by single `-`, each
/// part one or more ASCII lowercase letters or ASCII digits.
fn is_name(text: &str) -> bool {
    !text.is_empty() && text.split('-').all(is_name_part)
}

/// Whether `part` is one or more ASCII lowercase letters or ASCII digits.
fn is_name_part(part: &str) -> bool {
    !part.is_empty()
        && part
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
}

/// The leading run of ASCII digits of `folder`, empty when it starts with
/// anything else.
fn leading_digits(folder: &str) -> &str {
    let end = folder.bytes().take_while(u8::is_ascii_digit).count();
    &folder[..end]
}

/// `digits` without its leading zeros, so an all-zero run becomes empty.
fn without_leading_zeros(digits: &str) -> &str {
    digits.trim_start_matches('0')
}

/// Whether a number id names `folder`: its leading digits equal the number
/// once both lose their leading zeros, and the rest is empty or starts with
/// `-`.
fn names_number(number: &str, folder: &str) -> bool {
    let digits = leading_digits(folder);
    if digits.is_empty() {
        return false;
    }
    let rest = &folder[digits.len()..];
    (rest.is_empty() || rest.starts_with('-'))
        && without_leading_zeros(digits) == without_leading_zeros(number)
}

/// Whether a slug id names `folder`: the folder equals the slug, or is ASCII
/// digits, `-` and the slug.
fn names_slug(slug: &str, folder: &str) -> bool {
    if folder == slug {
        return true;
    }
    let digits = leading_digits(folder);
    !digits.is_empty() && folder[digits.len()..].strip_prefix('-') == Some(slug)
}
