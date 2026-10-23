//! Reading a project's change folders, `.run` markers and event files.
//!
//! The files are the truth (ADR 025): every reader folds the event streams
//! with rust-core and reads Markdown only as far as the tables need.
//!
//! Implements: rust-storage/change-listing
//! Implements: rust-storage/change-snapshot
//! Implements: rust-storage/text-fields
//! Implements: rust-storage/event-file-errors
//! Implements: rust-storage/archived-location-wins
//! Implements: rust-storage/archive-replay
//! Implements: rust-storage/table-events
//! Implements: rust-storage/plan-records
//! Implements: rust-storage/manifest-notices
//! Implements: rust-storage/history-reading
//! Implements: rust-storage/result-sections
//! Implements: rust-storage/result-disclosures
//! Implements: rust-storage/manual-edit-records
//! Implements: rust-storage/delta-capabilities
//! Implements: rust-storage/task-plans
//! Implements: rust-storage/task-stream-outcomes
//! Implements: rust-storage/change-folder-seal
//! Implements: rust-storage/marker-facts
//! Implements: rust-storage/planning-facts
//! Implements: rust-storage/land-facts
//! Implements: rust-storage/change-trees
//! Implements: rust-storage/change-listing-across-trees
//! Implements: rust-storage/usage-pause-record
//! Implements: rust-storage/autopilot-stop-record
//! Implements: rust-storage/after-land-failure-record
//! Implements: rust-storage/queue-item-titles
//! Implements: rust-storage/retry-context
//! Implements: rust-storage/change-folder-files
//! Implements: rust-storage/now-facts
//! Implements: rust-storage/watch-state-records
//! Implements: rust-storage/validator-failing-record

mod change_files;
mod error;
mod land;
mod listing;
mod manual;
mod now;
mod pending;
mod queue;
mod results;
mod retry;
mod seal;
mod sections;
mod snapshot;
mod text;
mod trees;
mod validator;
mod watch;

pub use change_files::{ChangeFiles, DoneMarker, LockFile, read_change_files};
pub use error::StorageError;
pub use land::{LandFacts, LandTask, read_land_facts};
pub use listing::{ChangeEntry, Location, list_changes};
pub use manual::{ManualEdit, read_manual_edits};
pub use now::{NowFacts, NowTask, read_now_facts};
pub use pending::{
    AfterLandFailure, AutopilotStop, PauseRecord, read_after_land_failure, read_autopilot_stop,
    read_usage_pause, watch_state_dir,
};
pub use queue::{QueueTitle, read_queue_titles};
pub use results::TaskDisclosure;
pub use retry::{RetryContext, read_retry_context};
pub use seal::change_folder_seal;
pub use sections::{ResultSections, parse_result_sections};
pub use snapshot::{
    CapabilityDelta, ChangeSnapshot, DeadAttempt, EventFacts, HaltMarker, LinkEntry,
    ManifestNotices, Notice, PlanRecord, RunningLock, TableEvent, TaskFile, TaskMarkers,
    TaskOutcomeFacts, read_archive, read_change, read_history,
};
pub use text::{frontmatter_string, goal_section, markdown_body, timestamp_ms};
pub use trees::{ChangeTree, TreeCandidate, change_trees, list_tree_changes};
pub use validator::{ValidatorFailing, validator_failing};
pub use watch::{ServiceRecord, WatchState, WatcherMode, WatcherRecord, read_watch_state};
