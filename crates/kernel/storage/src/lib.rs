//! Storage adapter: reads the committed files and builds the typed read model, cached in an index that can be rebuilt.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

pub mod model;
pub mod read;

pub use model::{
    TaskOutcome, TrialLabels, build_read_model, read_trial_labels, replace_read_model,
    task_outcomes, write_read_model, write_task_outcomes,
};
pub use read::{
    CapabilityDelta, ChangeEntry, ChangeSnapshot, DeadAttempt, EventFacts, HaltMarker, LinkEntry,
    Location, ManifestNotices, ManualEdit, Notice, PlanRecord, ResultSections, RunningLock,
    StorageError, TableEvent, TaskDisclosure, TaskFile, TaskMarkers, TaskOutcomeFacts,
    change_folder_seal, frontmatter_string, goal_section, list_changes, markdown_body,
    parse_result_sections, read_archive, read_change, read_history, read_manual_edits,
    timestamp_ms,
};
