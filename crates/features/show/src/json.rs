//! TypeScript's `osq show --json` document.

mod digest;
mod document;
mod event;
mod land;
mod planning;
mod tasks;
mod value;
mod verification;

use crate::facts::LandFacts;
use crate::model::Change;

/// One change's JSON text, without the final newline.
pub(crate) fn format(change: &Change, land: Option<&LandFacts>) -> String {
    document::build(change, land)
}
