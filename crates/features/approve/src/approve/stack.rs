//! Working out what a change waits for and recording a stacked approval.

#[path = "stack/approve.rs"]
mod approve;
#[path = "stack/capabilities.rs"]
mod capabilities;
#[path = "stack/changes.rs"]
mod changes;
#[path = "stack/select.rs"]
mod select;
#[path = "stack/state.rs"]
mod state;
#[path = "stack/text.rs"]
mod text;

pub(crate) use approve::approve;
pub(crate) use select::awaited;

/// One entry of what a change waits for: a folder, its hash and any overlap.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Awaited {
    /// The awaited change folder.
    pub(crate) folder: String,
    /// The folder's approved hash.
    pub(crate) hash: String,
    /// The shared capabilities of an overlap entry, or none for a declared one.
    pub(crate) overlap: Option<Vec<String>>,
}
