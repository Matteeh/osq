//! The data payload of each event type, by its JSON field names.
//!
//! Every struct refuses a field its type does not list and requires the fields
//! its type always writes, so a drifted line is an error rather than a guess.
//!
//! Implements: rust-core/event-types
//! Implements: rust-core/event-lines-round-trip

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

/// A field the JSON has either absent or `null`.
///
/// The inner [`Option`] carries `null`; the field's own [`Option`] carries
/// absence, so `None` stays absent and `Some(Nullable(None))` stays `null`.
#[derive(Clone, Debug, PartialEq)]
pub struct Nullable<T>(pub Option<T>);

impl<T: Serialize> Serialize for Nullable<T> {
    /// Writes the value, or `null` when it is absent.
    ///
    /// Implements: rust-core/event-lines-round-trip
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match &self.0 {
            Some(value) => value.serialize(serializer),
            None => serializer.serialize_none(),
        }
    }
}

impl<'de, T: DeserializeOwned> Deserialize<'de> for Nullable<T> {
    /// Reads the value or `null`, refusing a missing field.
    ///
    /// Implements: rust-core/event-lines-round-trip
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = Value::deserialize(deserializer)?;
        if value.is_null() {
            return Ok(Self(None));
        }
        serde_json::from_value(value)
            .map(|inner| Self(Some(inner)))
            .map_err(serde::de::Error::custom)
    }
}

/// Reads an optional field whose value may also be `null`.
fn de_opt_nullable<'de, D, T>(deserializer: D) -> Result<Option<Nullable<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned,
{
    Nullable::<T>::deserialize(deserializer).map(Some)
}

/// Payload of a `tool` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolData {
    /// The tool the harness ran.
    pub tool: String,
    /// A one-line summary of the call.
    pub summary: String,
}

/// Payload of a `tokens` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TokensData {
    /// Prompt tokens reported.
    pub prompt_tokens: u64,
    /// Candidate tokens reported.
    pub candidate_tokens: u64,
    /// Total tokens reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u64>,
    /// Cached tokens reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<u64>,
    /// Reasoning tokens reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<u64>,
    /// The cost reported, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<serde_json::Number>,
    /// The provider reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// The model reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Payload of a `text` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextData {
    /// The text the harness emitted.
    pub text: String,
}

/// Payload of a `file_changed` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileChangedData {
    /// The project-relative path that changed.
    pub path: String,
}

/// Payload of a `started` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartedData {
    /// The harness started.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub harness: Option<String>,
    /// The model the harness uses.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// The osq version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub osq_version: Option<String>,
    /// The execution attempt.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u64>,
    /// The watched project's HEAD commit, or `null` outside git.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "de_opt_nullable"
    )]
    pub project_commit: Option<Nullable<String>>,
    /// The task commit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
    /// The harness process id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u64>,
    /// The task timeout in seconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
    /// The harness version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// The first line of the harness binary's version output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub harness_version: Option<String>,
    /// How the harness authenticated.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub harness_auth: Option<String>,
    /// The task title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_title: Option<String>,
    /// The task tier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    /// The resolved scope, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<Value>,
    /// The entry paths, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry: Option<Value>,
    /// The skills, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<Value>,
}

/// Payload of a `verify_ran` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerifyRanData {
    /// The command that ran.
    pub command: String,
    /// The command's exit code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
    /// The wall seconds the command took.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<serde_json::Number>,
    /// The change-folder-relative log of the output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log: Option<String>,
    /// The legacy command field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verify_command: Option<String>,
    /// The captured output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// The declared start phase.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    /// The expected start colour.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected: Option<String>,
    /// Whether the start colour mismatched.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mismatch: Option<bool>,
    /// Paths the command named that did not exist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub missing_paths: Option<Vec<String>>,
    /// The task the run belongs to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,
}

/// Payload of a `result_written` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResultWrittenData {
    /// The result file written.
    pub path: String,
    /// Whether the watcher synthesized the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synthesized: Option<bool>,
}

/// Payload of an `exited` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExitedData {
    /// The exit code.
    pub exit_code: i64,
    /// The harness process id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u64>,
    /// The signal that ended the process.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signal: Option<String>,
    /// Whether the run hit its timeout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timed_out: Option<bool>,
    /// The wall seconds the run took.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub elapsed_seconds: Option<serde_json::Number>,
}

/// Payload of a `measures` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasuresData {
    /// The phase the measures were taken in.
    pub phase: String,
    /// Files in scope.
    pub scope_files: u64,
    /// Lines in scope.
    pub scope_lines: u64,
    /// Files in the repo.
    pub repo_files: u64,
    /// Lines in the repo.
    pub repo_lines: u64,
    /// Imports into the scoped files.
    pub import_fan_in: u64,
    /// Words in the proposal.
    pub proposal_words: u64,
    /// Words in the task.
    pub task_words: u64,
    /// Requirements in the deltas.
    pub delta_requirements: u64,
    /// Scenarios in the deltas.
    pub delta_scenarios: u64,
    /// The scope resolver version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope_resolver: Option<u64>,
    /// Files changed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changed_files: Option<u64>,
    /// Lines changed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changed_lines: Option<u64>,
    /// Scoped path hashes, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope_hashes: Option<Value>,
    /// Scoped manifest dependencies, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Value>,
    /// Tagged function hashes, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function_hashes: Option<Value>,
}

/// Payload of a `dependencies_added` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DependenciesAddedData {
    /// The added packages, kept as written.
    pub added: Value,
}

/// Payload of a `done` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DoneData {
    /// The task that is done.
    pub task: String,
}

/// Payload of a `done_manual` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DoneManualData {
    /// The task that is done.
    pub task: String,
    /// Why the human marked it done.
    pub reason: String,
}

/// Payload of a `dead` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeadData {
    /// The task that died.
    pub task: String,
    /// Why the task died.
    pub reason: String,
}

/// Payload of a `regressed` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegressedData {
    /// The regressed task, or `change`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,
    /// The verify exit code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
    /// The verify duration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<serde_json::Number>,
    /// The verify command.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// The paths that differ.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub differing_paths: Option<Vec<String>>,
    /// The paths a verify named that did not exist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub missing_paths: Option<Vec<String>>,
    /// Why the task regressed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Per-path attribution, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attribution: Option<Value>,
    /// The recorded scope hash.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recorded_hash: Option<String>,
    /// The current scope hash.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_hash: Option<String>,
    /// The recorded resolver version, or `null`.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "de_opt_nullable"
    )]
    pub recorded_resolver: Option<Nullable<serde_json::Number>>,
    /// The current resolver version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_resolver: Option<serde_json::Number>,
    /// The verify output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// Whether the verify timed out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timed_out: Option<bool>,
    /// Whether the recorded verification passed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verification_passed: Option<bool>,
}

/// Payload of a `retry` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetryData {
    /// The retried task, or `change`.
    pub target: String,
    /// Why the retry happened.
    pub reason: String,
    /// The following execution attempt.
    pub attempt: u64,
    /// Whether the watcher retried on its own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub automatic: Option<bool>,
}

/// Payload of a `stuck` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StuckData {
    /// The task that is stuck.
    pub task: String,
    /// The failure fingerprint seen twice.
    pub fingerprint: String,
}

/// Payload of a `harness_retry` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HarnessRetryData {
    /// The retry phase.
    pub phase: String,
    /// The harness's attempt number.
    pub attempt: u64,
    /// The harness's maximum attempts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_attempts: Option<u64>,
    /// The delay before the retry in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delay_ms: Option<u64>,
    /// Whether the retry succeeded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub success: Option<bool>,
    /// The error the harness reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Payload of a `recertification` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecertificationData {
    /// The recertified task.
    pub task: String,
    /// The outcome, `passed` or `requeued`.
    pub outcome: String,
    /// The paths that differ.
    pub differing_paths: Vec<String>,
    /// Per-path attribution, kept as written.
    pub attribution: Value,
    /// The command that ran.
    pub command: String,
    /// The command's exit code.
    pub exit_code: i64,
    /// The captured output.
    pub output: String,
    /// Whether the command timed out.
    pub timed_out: bool,
    /// The recorded scope hash.
    pub recorded_hash: String,
    /// The current scope hash.
    pub current_hash: String,
    /// The next execution attempt.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u64>,
    /// The failure reason carried to the next executor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Whether the watcher recertified on its own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub automatic: Option<bool>,
}

/// Payload of a `rejected` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RejectedData {
    /// Why the change was rejected.
    pub reason: String,
}

/// Payload of an `instructions_changed` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstructionsChangedData {
    /// The instruction inputs that differ.
    pub changed: Vec<String>,
}

/// Payload of a `baseline_ran` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BaselineRanData {
    /// The baseline outcome.
    pub outcome: String,
    /// The baseline command.
    pub command: String,
    /// The commit the baseline keyed on, or `null`.
    pub commit: Nullable<String>,
    /// The tree digest the baseline keyed on, or `null`.
    pub tree_digest: Nullable<String>,
    /// The command's exit code.
    pub exit_code: i64,
    /// The wall seconds the baseline took.
    pub duration_seconds: serde_json::Number,
    /// The change whose green baseline was reused.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reused_from: Option<String>,
    /// The failed command's output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

/// Payload of a `focused_ran` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FocusedRanData {
    /// The focused-test command.
    pub command: String,
    /// The test files run.
    pub files: Vec<String>,
    /// The scenarios run.
    pub scenarios: Vec<String>,
    /// The run's outcome.
    pub outcome: String,
    /// The command's exit code.
    pub exit_code: i64,
    /// The wall seconds the run took.
    pub duration: serde_json::Number,
    /// Whether the run timed out.
    pub timed_out: bool,
    /// The captured TAP output.
    pub output: String,
}

/// Payload of a `format_ran` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FormatRanData {
    /// The format command.
    pub command: String,
    /// The changed scoped files formatted.
    pub files: Vec<String>,
    /// The command's exit code.
    pub exit_code: i64,
    /// The wall seconds the run took.
    pub duration: serde_json::Number,
    /// Whether the run timed out.
    pub timed_out: bool,
    /// The tail of the run's output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

/// Payload of a `mutation_ran` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MutationRanData {
    /// The file under test.
    pub file: String,
    /// The function under test.
    pub function: String,
    /// The mutated ranges.
    pub ranges: Vec<String>,
    /// The scenarios the pick covers.
    pub scenarios: Vec<String>,
    /// The tests that ran.
    pub tests: Vec<String>,
    /// The run's outcome.
    pub outcome: String,
    /// Mutants killed.
    pub killed: u64,
    /// Mutants survived.
    pub survived: u64,
    /// Mutants invalid.
    pub invalid: u64,
    /// The survivors, kept as written.
    pub survivors: Value,
    /// The wall seconds the run took.
    pub duration: serde_json::Number,
    /// The command's exit code, or `null`.
    pub exit_code: Nullable<i64>,
    /// Why the pick was not measured.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// The command's bounded output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

/// Payload of a `validator_ran` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidatorRanData {
    /// The validator outcome.
    pub outcome: String,
    /// The validator harness.
    pub harness: String,
    /// The validator model.
    pub model: String,
    /// The wall seconds the run took.
    pub duration: serde_json::Number,
    /// The run's exit code, or `null`.
    pub exit_code: Nullable<i64>,
    /// How many scenarios were judged.
    pub scenarios: u64,
    /// The findings, kept as written.
    pub findings: Value,
    /// The project-relative paths put back.
    pub restored: Vec<String>,
    /// Why the validator did not run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// The run's output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

/// Payload of an `auto_steer_ran` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AutoSteerRanData {
    /// The steering outcome.
    pub outcome: String,
    /// The steering harness.
    pub harness: String,
    /// The steering model.
    pub model: String,
    /// The wall seconds the run took.
    pub duration: serde_json::Number,
    /// The run's exit code, or `null`.
    pub exit_code: Nullable<i64>,
    /// The trigger descriptions.
    pub triggers: Vec<String>,
    /// The changed paths.
    pub changed: Vec<String>,
    /// The project-relative paths put back.
    pub restored: Vec<String>,
    /// The failure output or lint errors.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

/// Payload of a `vcs_violation` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VcsViolationData {
    /// The git fields that moved, kept as written.
    pub moved: Value,
    /// The git state before the agent spawned, kept as written.
    pub before: Value,
    /// The git state after the agent exited, kept as written.
    pub after: Value,
}

/// Payload of a `scope_violation` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScopeViolationData {
    /// The files changed outside scope.
    pub files: Vec<String>,
}

/// Payload of a `usage_limit` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UsageLimitData {
    /// When the limit resets.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resets_at: Option<String>,
    /// The harness's message.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Payload of a `paused` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PausedData {
    /// The paused task.
    pub task: String,
    /// The time the pause lasts until.
    pub until: String,
    /// Where the reset time came from.
    pub source: String,
    /// The limit's message.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Payload of a `change_verify_rerun` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangeVerifyRerunData {
    /// The 1-based rerun number.
    pub rerun: u64,
    /// The failing test files rerun.
    pub tests: Vec<String>,
    /// Whether the rerun passed.
    pub passed: bool,
}

/// Payload of an `archived` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchivedData {
    /// The archive path.
    pub archive_path: String,
    /// The verification record, kept as written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verification: Option<Value>,
}

/// Payload of a `synced` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncedData {
    /// The default branch synced.
    pub default_branch: String,
    /// How many commits were synced.
    pub commits: u64,
    /// The sync duration.
    pub duration: serde_json::Number,
}

/// Payload of a `sync_stopped` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncStoppedData {
    /// Why syncing stopped.
    pub reason: String,
    /// The message shown.
    pub message: String,
    /// The default branch synced.
    pub default_branch: String,
}

/// Payload of a `verification_recorded` event.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerificationRecordedData {
    /// The recorded outcome.
    pub outcome: String,
    /// A free-form note, or `null`.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "de_opt_nullable"
    )]
    pub note: Option<Nullable<String>>,
}
