//! The one validator-failing item of the archived changes.

use osq_kernel_storage::{ChangeSnapshot, validator_failing};

use super::change_id;
use crate::needs::Item;

/// The latest validator run, when it failed.
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
    Some(Item {
        line: format!(
            "  {id}: {title} — validator {} {}× in a row: {} — osq show {id}",
            record.outcome.as_str(),
            record.runs,
            record.error
        ),
        id,
    })
}
