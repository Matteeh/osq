//! The typed view of `.run/manifest.json`.
//!
//! Implements: rust-storage/manifest-file

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::Value;

/// The fields osq writes to `.run/manifest.json`, each one optional.
///
/// Unknown keys are ignored, as "Manifest file" says. The fields exist so
/// serde refuses a wrong-typed one even when no table reads it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[expect(
    dead_code,
    reason = "the fields are typed so serde refuses a wrong-typed one, even when no table reads it"
)]
pub(super) struct Manifest {
    /// Content hashes by path; a null hash is no hash.
    pub(super) hashes: Option<BTreeMap<String, Option<String>>>,
    /// The version of osq that wrote the manifest.
    pub(super) osq_version: Option<String>,
    /// The harness that wrote it.
    pub(super) harness: Option<String>,
    /// The model that wrote it.
    pub(super) model: Option<String>,
    /// The planner that planned the change, or null.
    pub(super) planner: Option<String>,
    /// The effort the planner used, or null.
    pub(super) effort: Option<String>,
    /// The change folder's creation time.
    pub(super) created_at: Option<String>,
    /// Set only when `created_at` is the folder's creation time.
    pub(super) created_at_source: Option<String>,
    /// The approval time, absent on a planning-only manifest.
    pub(super) approved_at: Option<String>,
    /// The number of planning sessions at build time.
    pub(super) planning_sessions: Option<u64>,
    /// The approval's flags, absent on a planning-only manifest.
    pub(super) approval_flags: Option<ApprovalFlags>,
    /// The accepted ADRs by number to hash.
    pub(super) decisions: Option<BTreeMap<String, String>>,
    /// The approval digest's notices, absent on a planning-only manifest.
    pub(super) notices: Option<Notices>,
}

/// The approval's distinct sorted flag ids and how they were handled.
#[derive(Debug, Deserialize)]
#[expect(
    dead_code,
    reason = "the fields are typed so serde refuses a wrong-typed one, even when no table reads it"
)]
pub(super) struct ApprovalFlags {
    /// The distinct sorted flag ids.
    pub(super) ids: Vec<String>,
    /// How the flags were handled: `shown` or `confirmed`.
    pub(super) mode: String,
}

/// The approval digest's notices record.
#[derive(Debug, Deserialize)]
pub(super) struct Notices {
    /// The notice items, kept as written for "Manifest notices" filtering.
    pub(super) items: Vec<Value>,
    /// The opened ids, kept as written; null and missing both read as none.
    pub(super) opened: Option<Vec<Value>>,
}
