//! Reading and writing a feature's durable byte offsets for one change.

use std::collections::BTreeMap;
use std::fs;
use std::io::{self, ErrorKind};
use std::path::Path;

use osq_kernel_storage::write_durable;
use serde_json::{Map, Value};

use super::failure::ReactionFailure;

/// One feature's byte offset in each event file of a change.
pub(crate) type Cursor = BTreeMap<String, u64>;

/// Reads a feature's cursor for a change, empty when its file is missing.
///
/// Implements: rust-loop/delivery-cursor
pub(crate) fn read(change: &Path, name: &str, feature: &str) -> Result<Cursor, ReactionFailure> {
    let path = cursor_path(change, feature);
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Cursor::new()),
        Err(_) => return Err(invalid(change, name, feature, &path)),
    };
    parse(&text).ok_or_else(|| invalid(change, name, feature, &path))
}

/// Writes a feature's cursor for a change through the durable write.
///
/// Implements: rust-loop/delivery-cursor
pub(crate) fn write(change: &Path, feature: &str, cursor: &Cursor) -> io::Result<()> {
    let folder = change.join(".run").join("delivered");
    fs::create_dir_all(&folder)?;
    write_durable(&folder.join(feature), serialize(cursor).as_bytes())
}

/// The cursor file's path inside a change folder.
///
/// Implements: rust-loop/delivery-cursor
fn cursor_path(change: &Path, feature: &str) -> std::path::PathBuf {
    change.join(".run").join("delivered").join(feature)
}

/// Reads a cursor from its JSON text, or nothing when it is not an object of
/// non-negative integer offsets.
///
/// Implements: rust-loop/delivery-cursor
fn parse(text: &str) -> Option<Cursor> {
    let Value::Object(object) = serde_json::from_str::<Value>(text).ok()? else {
        return None;
    };
    object
        .into_iter()
        .map(|(name, value)| value.as_u64().map(|offset| (name, offset)))
        .collect()
}

/// Writes a cursor as one compact JSON object with sorted keys and a newline.
///
/// Implements: rust-loop/delivery-cursor
fn serialize(cursor: &Cursor) -> String {
    let mut object = Map::new();
    for (name, offset) in cursor {
        object.insert(name.clone(), Value::from(*offset));
    }
    format!("{}\n", Value::Object(object))
}

/// Builds the failure an unreadable cursor file reports.
///
/// Implements: rust-loop/delivery-cursor
fn invalid(change: &Path, name: &str, feature: &str, path: &Path) -> ReactionFailure {
    ReactionFailure::new(
        feature,
        "",
        name,
        format!("cursor {} is not valid", relative(change, path)),
    )
}

/// A path below the change folder, with `/` between its parts.
///
/// Implements: rust-loop/delivery-cursor
fn relative(change: &Path, path: &Path) -> String {
    path.strip_prefix(change)
        .unwrap_or(path)
        .iter()
        .map(|part| part.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}
