//! The approval seal: the text of a `.run/approved` marker.
//!
//! Core compares two seals; it never computes one over a change folder.
//!
//! Implements: rust-core/approval-seal

use std::fmt;

/// An approval seal: `sha256:` and 64 lowercase hexadecimal digits.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Seal(String);

impl Seal {
    /// Reads a marker's text as a seal, trimming surrounding whitespace.
    ///
    /// # Errors
    ///
    /// Returns [`SealError`] when, after trimming, the text is not `sha256:`
    /// followed by exactly 64 lowercase hexadecimal digits.
    ///
    /// Implements: rust-core/approval-seal
    pub fn parse(text: &str) -> Result<Self, SealError> {
        let trimmed = text.trim();
        let Some(hex) = trimmed.strip_prefix("sha256:") else {
            return Err(SealError);
        };
        let lowercase_hex = hex
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase());
        if hex.len() == 64 && lowercase_hex {
            Ok(Self(trimmed.to_owned()))
        } else {
            Err(SealError)
        }
    }

    /// The seal's text, without surrounding whitespace.
    ///
    /// Implements: rust-core/approval-seal
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Seal {
    /// Writes the seal's text.
    ///
    /// Implements: rust-core/approval-seal
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

/// Why a marker's text is not a seal.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SealError;

impl fmt::Display for SealError {
    /// Writes the error's message.
    ///
    /// Implements: rust-core/approval-seal
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("not a seal: expected `sha256:` and 64 lowercase hex digits")
    }
}

impl std::error::Error for SealError {}
