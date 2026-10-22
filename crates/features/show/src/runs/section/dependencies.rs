//! The `Dependencies added:` line of one task.

use serde_json::Value;

use crate::events::Event;

use super::values;

/// One package added to one manifest.
struct Pair {
    /// The manifest path.
    file: String,
    /// The package name.
    name: String,
}

/// The distinct dependencies-added line, or `None` without a valid pair.
pub(super) fn line(events: &[Event]) -> Option<String> {
    let mut pairs = Vec::new();
    for event in events {
        if event.kind != "dependencies_added" {
            continue;
        }
        let Some(Value::Array(items)) = values::field(event, "added") else {
            continue;
        };
        for item in items {
            let Value::Object(fields) = item else {
                continue;
            };
            let (Some(file), Some(name)) = (
                values::trimmed(fields.get("file")),
                values::trimmed(fields.get("name")),
            ) else {
                continue;
            };
            pairs.push(Pair { file, name });
        }
    }
    pairs.sort_by(|left, right| {
        left.file
            .cmp(&right.file)
            .then_with(|| left.name.cmp(&right.name))
    });
    pairs.dedup_by(|left, right| left.file == right.file && left.name == right.name);
    if pairs.is_empty() {
        return None;
    }
    let rendered = pairs
        .iter()
        .map(|pair| format!("{} ({})", pair.name, pair.file))
        .collect::<Vec<_>>()
        .join(", ");
    Some(format!("      Dependencies added: {rendered}"))
}
