//! Reading a `plan` invocation's arguments into its mode.

use osq_core::FeatureError;

/// What a `plan` invocation asks the feature to do.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Arguments {
    /// Plan the next queue item, optionally replanning a rejected one.
    Next {
        /// Whether a rejected item may be planned again.
        replan: bool,
    },
    /// Steer the active change matching this id.
    Steer(String),
}

/// Reads a `plan` invocation's arguments, refusing every other form.
///
/// Implements: rust-plan/plan-arguments
pub(crate) fn parse(args: &[String]) -> Result<Arguments, FeatureError> {
    if let [id] = args {
        if !id.starts_with("--") {
            return Ok(Arguments::Steer(id.clone()));
        }
    }
    let mut next = 0_usize;
    let mut replan = 0_usize;
    for argument in args {
        match argument.as_str() {
            "--next" => next += 1,
            "--replan" => replan += 1,
            _ => return Err(usage()),
        }
    }
    if next == 1 && replan <= 1 {
        Ok(Arguments::Next {
            replan: replan == 1,
        })
    } else {
        Err(usage())
    }
}

/// Builds the refusal for a `plan` invocation with other arguments.
///
/// Implements: rust-plan/plan-arguments
fn usage() -> FeatureError {
    FeatureError::usage("plan", "expected --next [--replan] or one change id")
}
