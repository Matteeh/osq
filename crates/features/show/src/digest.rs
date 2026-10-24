//! The approval digest lines of an unapproved change.

mod section;

pub(crate) use section::{
    Digest, DigestCapability, DigestDecision, DigestTask, Flag, build, lines,
};
