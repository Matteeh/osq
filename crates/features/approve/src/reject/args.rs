//! Reading `reject`'s arguments left to right, before any file is read.

use osq_core::FeatureError;

/// The usage text for arguments that do not hold one id and one reason.
const EXPECTED: &str = "expected <id> --reason <text>";

/// The usage text for a reason that is blank after trimming.
const EMPTY_REASON: &str = "a non-empty rejection reason is required";

/// One reject call's change id and trimmed reason.
pub(crate) struct Parsed {
    /// The one argument that is not a `--reason` value.
    pub(crate) id: String,
    /// The reason without surrounding whitespace.
    pub(crate) reason: String,
}

/// Reads the change id and the one `--reason` value from `arguments`.
///
/// # Errors
///
/// Returns a `Usage` error with the command `reject` when there is not exactly
/// one id and one `--reason` with a value, or when the trimmed reason is empty.
///
/// Implements: rust-approve/reject-arguments
pub(crate) fn parse(arguments: &[String]) -> Result<Parsed, FeatureError> {
    let mut ids = Vec::new();
    let mut reason: Option<String> = None;
    let mut index = 0;
    while index < arguments.len() {
        if arguments[index] == "--reason" {
            let Some(value) = arguments.get(index + 1) else {
                return Err(usage(EXPECTED));
            };
            if reason.is_some() {
                return Err(usage(EXPECTED));
            }
            reason = Some(value.clone());
            index += 2;
        } else {
            ids.push(arguments[index].clone());
            index += 1;
        }
    }
    if ids.len() != 1 || reason.is_none() {
        return Err(usage(EXPECTED));
    }
    let trimmed = reason.unwrap_or_default().trim().to_owned();
    if trimmed.is_empty() {
        return Err(usage(EMPTY_REASON));
    }
    Ok(Parsed {
        id: ids.remove(0),
        reason: trimmed,
    })
}

/// Builds a reject usage error with `message`.
fn usage(message: &str) -> FeatureError {
    FeatureError::usage("reject", message)
}
