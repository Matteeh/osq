//! Choosing the pi program from a setting or the caller's environment.

use std::collections::BTreeMap;

/// The environment variable TypeScript falls back to.
const PI_PATH_VARIABLE: &str = "OSQ_PI_PATH";

/// The program used when neither the setting nor the environment names one.
const DEFAULT_PROGRAM: &str = "pi";

/// Resolves pi's program from the configured setting and the caller's variables.
///
/// Implements: rust-harnesses/pi-binary
#[must_use]
pub fn resolve_pi_binary(setting: Option<&str>, env: &BTreeMap<String, String>) -> String {
    if let Some(setting) = non_blank(setting) {
        return setting.to_owned();
    }
    if let Some(from_env) = env
        .get(PI_PATH_VARIABLE)
        .and_then(|value| non_blank(Some(value)))
    {
        return from_env.to_owned();
    }
    DEFAULT_PROGRAM.to_owned()
}

/// Returns the trimmed text when it is not blank.
///
/// Implements: rust-harnesses/pi-binary
fn non_blank(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|trimmed| !trimmed.is_empty())
}
