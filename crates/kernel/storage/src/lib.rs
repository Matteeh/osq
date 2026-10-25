//! Storage adapter: reads the committed files and builds the typed read model, cached in an index that can be rebuilt.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

pub mod model;
pub mod read;
pub mod scope;
pub mod write;

pub use model::{
    TaskOutcome, TrialLabels, build_read_model, read_trial_labels, replace_read_model,
    task_outcomes, write_read_model, write_task_outcomes,
};
pub use read::{
    AfterLandFailure, AutopilotStop, CapabilityDelta, CapabilitySidecars, ChangeEntry, ChangeFiles,
    ChangeSnapshot, ChangeTree, DeadAttempt, DependencyPair, DoneMarker, EventFacts, HaltMarker,
    LandFacts, LandTask, LinkEntry, Location, LockFile, ManifestNotices, ManualEdit, Notice,
    NowFacts, NowTask, PauseRecord, PlanRecord, PreSpawnHistory, QueueTitle, ResultSections,
    RetryContext, RetryGroup, RunningLock, ScopeHistory, ScopeResolver, ServiceRecord, StartCount,
    StorageError, TableEvent, TaskDisclosure, TaskEventFile, TaskFile, TaskHistory, TaskMarkers,
    TaskOutcomeFacts, TaskSize, TreeCandidate, ValidationRun, ValidatorFailing, WatchState,
    WatcherMode, WatcherRecord, change_folder_seal, change_trees, frontmatter_string, goal_section,
    list_changes, list_tree_changes, markdown_body, parse_result_sections, planning_token_models,
    read_after_land_failure, read_archive, read_autopilot_stop, read_capability_sidecars,
    read_change, read_change_files, read_change_fixes, read_dependencies_added, read_history,
    read_land_facts, read_latest_validation, read_manual_edits, read_now_facts, read_queue_titles,
    read_rejection_planner, read_result_disclosures, read_retry_context, read_task_event_files,
    read_task_history, read_task_sizes, read_usage_pause, read_watch_state, timestamp_ms,
    validator_failing, watch_state_dir,
};
pub use scope::{
    DoneMarkerError, DoneScope, ScopeFile, ScopeHash, differing_scope_paths, read_done_scope,
    refresh_done_marker, task_scope_hash,
};
pub use write::write_durable;
