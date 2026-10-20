//! Merging a parsed delta into a living spec, as TypeScript osq does (ADR 026).

mod apply;
mod apply_names;
mod base;
mod change;
mod compose;
mod error;

pub use change::{MergeChangeError, MergedSpec, merge_change};
pub use compose::{merge_delta, merge_living_spec};
pub use error::MergeError;
