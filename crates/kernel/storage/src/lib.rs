//! Storage adapter: reads the committed files and builds the typed read model, cached in an index that can be rebuilt.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

pub mod model;
pub mod read;

pub use model::{TrialLabels, build_read_model, read_trial_labels, write_read_model};
pub use read::{
    ChangeEntry, ChangeSnapshot, DeadAttempt, EventFacts, LinkEntry, Location, ManifestNotices,
    ManualEdit, Notice, PlanRecord, ResultSections, StorageError, TableEvent, TaskDisclosure,
    TaskFile, frontmatter_string, goal_section, list_changes, markdown_body, parse_result_sections,
    read_archive, read_change, read_history, read_manual_edits, timestamp_ms,
};
