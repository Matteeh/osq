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
    AfterLandFailure, AutopilotStop, CapabilityDelta, ChangeEntry, ChangeFiles, ChangeSnapshot,
    ChangeTree, DeadAttempt, DoneMarker, EventFacts, HaltMarker, LandFacts, LandTask, LinkEntry,
    Location, LockFile, ManifestNotices, ManualEdit, Notice, NowFacts, NowTask, PauseRecord,
    PlanRecord, PreSpawnHistory, QueueTitle, ResultSections, RetryContext, RetryGroup, RunningLock,
    ScopeHistory, ServiceRecord, StartCount, StorageError, TableEvent, TaskDisclosure, TaskFile,
    TaskHistory, TaskMarkers, TaskOutcomeFacts, TreeCandidate, ValidatorFailing, WatchState,
    WatcherMode, WatcherRecord, change_folder_seal, change_trees, frontmatter_string, goal_section,
    list_changes, list_tree_changes, markdown_body, parse_result_sections, read_after_land_failure,
    read_archive, read_autopilot_stop, read_change, read_change_files, read_history,
    read_land_facts, read_manual_edits, read_now_facts, read_queue_titles, read_rejection_planner,
    read_retry_context, read_task_history, read_usage_pause, read_watch_state, timestamp_ms,
    validator_failing, watch_state_dir,
};
