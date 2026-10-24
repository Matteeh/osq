//! The per-project last-look cursor: its path, reading and writing.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{timestamp_ms, watch_state_dir};

/// The cursor file path, `<home>/.osq/last-look/<hash>.json`.
///
/// The hash is the last part of storage's watch state folder, the SHA-256 of
/// the root's canonical path.
///
/// Implements: rust-inbox/last-look-cursor
pub(crate) fn path(root: &Path, home: &Path) -> PathBuf {
    let state = watch_state_dir(root, home);
    let name = state
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
    home.join(".osq")
        .join("last-look")
        .join(format!("{name}.json"))
}

/// Reads the cursor in epoch milliseconds, or `None` without a valid one.
///
/// Implements: rust-inbox/last-look-cursor
pub(crate) fn read(root: &Path, home: &Path) -> Option<i64> {
    let content = fs::read_to_string(path(root, home)).ok()?;
    let last_look = last_look_string(&content)?;
    timestamp_ms(&last_look)
}

/// Writes the cursor for `now_ms`, creating its folders.
///
/// # Errors
///
/// Returns the I/O error of the failed folder creation or write.
///
/// Implements: rust-inbox/last-look-cursor
pub(crate) fn write(root: &Path, home: &Path, now_ms: i64) -> io::Result<()> {
    let cursor = path(root, home);
    if let Some(parent) = cursor.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        cursor,
        format!("{{\"lastLook\":\"{}\"}}\n", format_utc(now_ms)),
    )
}

/// The `lastLook` string of a JSON object, or `None` without one.
///
/// Implements: rust-inbox/last-look-cursor
fn last_look_string(content: &str) -> Option<String> {
    let body = content.trim().strip_prefix('{')?.strip_suffix('}')?;
    let (key, value) = body.split_once(':')?;
    if key.trim() != "\"lastLook\"" {
        return None;
    }
    value
        .trim()
        .strip_prefix('"')?
        .strip_suffix('"')
        .map(ToOwned::to_owned)
}

/// Writes epoch milliseconds as `YYYY-MM-DDTHH:MM:SS.mmmZ` in UTC.
///
/// Implements: rust-inbox/last-look-cursor
/// Implements: rust-inbox/inbox-json
pub(crate) fn format_utc(ms: i64) -> String {
    let seconds = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = seconds.div_euclid(86_400);
    let day_seconds = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = day_seconds / 3_600;
    let minute = (day_seconds % 3_600) / 60;
    let second = day_seconds % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// Turns days since the Unix epoch into a proleptic Gregorian date.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    };
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}
