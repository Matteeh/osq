//! The one validator-failing item of the archived changes.

use osq_kernel_storage::{ChangeSnapshot, validator_failing};

use crate::groups::change_id;
use crate::needs::{Item, Kind, ValidatorFacts};

/// The latest validator run, when it failed.
///
/// Implements: rust-inbox/validator-failing-item
pub(crate) fn item(snapshots: &[ChangeSnapshot]) -> Option<Item> {
    let record = validator_failing(snapshots)?;
    let snapshot = snapshots
        .iter()
        .find(|snapshot| snapshot.folder == record.change)?;
    let id = change_id(snapshot);
    let title = snapshot
        .title
        .clone()
        .unwrap_or_else(|| snapshot.folder.clone());
    let facts = ValidatorFacts {
        outcome: record.outcome.as_str().to_owned(),
        runs: record.runs,
        error: record.error,
    };
    Some(Item::new(
        &id,
        &title,
        None,
        Kind::ValidatorFailing(facts),
        format!("osq show {id}"),
    ))
}
