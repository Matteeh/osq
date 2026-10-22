//! Reading one change's event streams and printing its event timeline.
//!
//! Implements: rust-show/show-text

mod model;
mod read;
mod timeline;

pub(crate) use model::{Event, js_number};
pub(crate) use read::read;
pub(crate) use timeline::section;
