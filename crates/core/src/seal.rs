//! The approval seal: the text of a `.run/approved` marker.
//!
//! Core compares two seals and computes one over entries of path and bytes; it
//! never reads a change folder.
//!
//! Implements: rust-core/approval-seal

use sha2::{Digest, Sha256};
use std::fmt::{self, Write};

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

/// A seal computed over a folder's entries.
///
/// [`compute_seal`] is the only way to get one, so approving a change always
/// hashes its entries. Gates cannot be skipped: building a `ComputedSeal` by
/// hand does not compile, because its field is private.
///
/// ```compile_fail,E0423
/// use osq_core::{ComputedSeal, Seal};
///
/// let seal = Seal::parse(&format!("sha256:{}", "a".repeat(64))).unwrap();
/// let computed = ComputedSeal(seal);
/// ```
///
/// Implements: rust-core/seal-computation
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ComputedSeal(Seal);

impl ComputedSeal {
    /// The seal's text.
    ///
    /// Implements: rust-core/seal-computation
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    /// The seal as a [`Seal`].
    ///
    /// Implements: rust-core/seal-computation
    #[must_use]
    pub fn seal(self) -> Seal {
        self.0
    }
}

/// Computes the seal `hashChangeFolder` gives for a folder holding exactly
/// `entries`, each a relative path with `/` separators and its bytes.
///
/// Entries are ordered by path in UTF-16 code unit order. Bytes are decoded as
/// JavaScript decodes UTF-8, CRLF becomes LF and, in `tasks.md` alone,
/// checkboxes are reset.
///
/// Implements: rust-core/seal-computation
#[must_use]
pub fn compute_seal(entries: &[(&str, &[u8])]) -> ComputedSeal {
    let mut sorted: Vec<&(&str, &[u8])> = entries.iter().collect();
    sorted.sort_by(|left, right| left.0.encode_utf16().cmp(right.0.encode_utf16()));
    let mut hasher = Sha256::new();
    for (path, bytes) in sorted {
        let text = String::from_utf8_lossy(bytes).replace("\r\n", "\n");
        let text = if *path == "tasks.md" {
            reset_checkboxes(&text)
        } else {
            text
        };
        hasher.update(path.as_bytes());
        hasher.update([0]);
        hasher.update(text.as_bytes());
        hasher.update([0]);
    }
    let hex = hasher
        .finalize()
        .iter()
        .fold(String::new(), |mut hex, byte| {
            let _ = write!(hex, "{byte:02x}");
            hex
        });
    ComputedSeal(Seal(format!("sha256:{hex}")))
}

/// JavaScript's `\s`: not [`char::is_whitespace`], which counts U+0085 and
/// leaves out U+FEFF.
fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// Whether a JavaScript `^` under the `m` flag matches before `chars[at]`.
fn is_line_start(chars: &[char], at: usize) -> bool {
    at == 0 || matches!(chars[at - 1], '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// The index after the run of JavaScript whitespace starting at `from`.
fn skip_space(chars: &[char], from: usize) -> usize {
    from + chars[from..]
        .iter()
        .take_while(|c| is_js_space(**c))
        .count()
}

/// Applies `/^(\s*-\s*\[)[xX](\])/gm` with ` ` for the letter.
fn reset_checkboxes(text: &str) -> String {
    let mut chars: Vec<char> = text.chars().collect();
    for at in 0..chars.len() {
        if !is_line_start(&chars, at) {
            continue;
        }
        let dash = skip_space(&chars, at);
        if chars.get(dash) != Some(&'-') {
            continue;
        }
        let open = skip_space(&chars, dash + 1);
        if chars.get(open) == Some(&'[')
            && matches!(chars.get(open + 1), Some('x' | 'X'))
            && chars.get(open + 2) == Some(&']')
        {
            chars[open + 1] = ' ';
        }
    }
    chars.into_iter().collect()
}
