//! Reading the retry arguments before any file is touched.

use osq_core::FeatureError;

use super::text;

/// The change target that names a change-level regression.
pub(crate) const CHANGE: &str = "change";

/// Trims the target and refuses anything but `change` or all ASCII digits.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` naming the target the
/// user gave.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn target(raw: &str) -> Result<&str, FeatureError> {
    let trimmed = raw.trim();
    let digits = !trimmed.is_empty() && trimmed.bytes().all(|byte| byte.is_ascii_digit());
    if trimmed == CHANGE || digits {
        Ok(trimmed)
    } else {
        Err(text::invalid_target(raw))
    }
}

/// A folder's leading digits, or the whole name when it has none.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn id(folder: &str) -> &str {
    let digits = folder.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        folder
    } else {
        &folder[..digits]
    }
}
