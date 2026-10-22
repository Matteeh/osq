//! Writing TypeScript's `.run/paused.md` for a usage-limit pause.

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_runners::UsagePause;

/// The body a pause holds when its limit gave no error.
const DEFAULT_BODY: &str = "usage limit reached";

/// Builds `.run/paused.md`'s bytes for `pause`.
///
/// Implements: rust-run/run-usage-pause
pub(crate) fn content(pause: &UsagePause) -> String {
    let body = pause.error.as_deref().unwrap_or(DEFAULT_BODY);
    format!(
        "---\ntask: \"{}\"\nuntil: \"{}\"\nsource: \"{}\"\n---\n{body}\n",
        pause.task,
        pause.until,
        pause.source.as_str()
    )
}

/// Writes the change folder's `.run/paused.md`, creating `.run/` when needed.
///
/// # Errors
///
/// Returns a `Failed` error with the command `run` when the `.run` folder or
/// the pause file cannot be created or written.
///
/// Implements: rust-run/run-usage-pause
pub(crate) fn write(folder: &Path, pause: &UsagePause) -> Result<(), FeatureError> {
    let dir = folder.join(".run");
    fs::create_dir_all(&dir).map_err(|error| failed(&dir, &error))?;
    let path = dir.join("paused.md");
    fs::write(&path, content(pause)).map_err(|error| failed(&path, &error))
}

/// Builds the failed error for a pause path that could not be written.
fn failed(path: &Path, error: &std::io::Error) -> FeatureError {
    FeatureError::failed("run", format!("cannot write {}: {error}", path.display()))
}
