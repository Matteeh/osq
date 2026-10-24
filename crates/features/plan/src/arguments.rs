//! Reading a `plan` invocation's arguments into its mode.

use osq_core::FeatureError;

/// What a `plan` invocation asks the feature to do.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Arguments {
    /// Plan the next queue item, optionally replanning a rejected one.
    Next {
        /// Whether a rejected item may be planned again.
        replan: bool,
        /// Whether to print the prompt instead of writing and handing it off.
        print: bool,
    },
    /// Steer the active change matching this name.
    Steer {
        /// The change's trimmed name.
        name: String,
        /// The brief value, used once task 2 plans from a brief.
        brief: Option<String>,
        /// Whether to print the prompt instead of writing and handing it off.
        print: bool,
    },
}

/// The raw values a `plan` invocation's arguments give.
#[derive(Debug, Default)]
struct Flags {
    /// Whether `--next` was given.
    next: bool,
    /// Whether `--replan` was given.
    replan: bool,
    /// Whether `--print` or `-p` was given.
    print: bool,
    /// The value after `--brief`, if given.
    brief: Option<String>,
    /// The value after `--notes`, if given.
    notes: Option<String>,
    /// The last argument that is not a flag, if given.
    name: Option<String>,
}

/// Reads a `plan` invocation's arguments, refusing every other form.
///
/// Implements: rust-plan/plan-arguments
pub(crate) fn parse(args: &[String]) -> Result<Arguments, FeatureError> {
    let mut flags = Flags::default();

    let mut index = 0;
    while index < args.len() {
        let argument = args[index].as_str();
        match argument {
            "--next" => once(&mut flags.next)?,
            "--replan" => once(&mut flags.replan)?,
            "--print" | "-p" => once(&mut flags.print)?,
            "--brief" => {
                if flags.brief.is_some() {
                    return Err(usage());
                }
                flags.brief = Some(take_value(args, &mut index)?);
                continue;
            }
            "--notes" => {
                if flags.notes.is_some() {
                    return Err(usage());
                }
                flags.notes = Some(take_value(args, &mut index)?);
                continue;
            }
            flag if flag.starts_with('-') => return Err(usage()),
            _ => {
                if flags.name.is_some() {
                    return Err(usage());
                }
                flags.name = Some(argument.to_owned());
            }
        }
        index += 1;
    }

    let name = flags
        .name
        .take()
        .map(|name| name.trim().to_owned())
        .filter(|name| !name.is_empty());
    refuse_combinations(&flags, name.as_deref())?;
    if flags.next {
        Ok(Arguments::Next {
            replan: flags.replan,
            print: flags.print,
        })
    } else {
        Ok(Arguments::Steer {
            name: name.unwrap_or_default(),
            brief: flags.brief,
            print: flags.print,
        })
    }
}

/// Marks a flag as given, refusing a second occurrence.
///
/// Implements: rust-plan/plan-arguments
fn once(seen: &mut bool) -> Result<(), FeatureError> {
    if *seen {
        return Err(usage());
    }
    *seen = true;
    Ok(())
}

/// Takes the argument after a value flag, advancing past both.
///
/// Implements: rust-plan/plan-arguments
fn take_value(args: &[String], index: &mut usize) -> Result<String, FeatureError> {
    let value = args.get(*index + 1).ok_or_else(usage)?.clone();
    *index += 2;
    Ok(value)
}

/// Refuses the combinations TypeScript refuses, in TypeScript's order.
///
/// Implements: rust-plan/plan-arguments
fn refuse_combinations(flags: &Flags, name: Option<&str>) -> Result<(), FeatureError> {
    if flags.notes.is_some() {
        return Err(refusal("`--notes` is valid only with `--run`"));
    }
    if flags.next {
        if name.is_some() {
            return Err(refusal(
                "`plan --next` cannot be combined with a change name",
            ));
        }
        if flags.brief.is_some() {
            return Err(refusal("`plan --next` cannot be combined with --brief"));
        }
    } else if flags.replan {
        return Err(refusal("`--replan` is valid only with `plan --next`"));
    } else if name.is_none() {
        return Err(refusal("Provide a change name or use `plan --next`"));
    }
    Ok(())
}

/// Builds a refusal with one of TypeScript's messages.
///
/// Implements: rust-plan/plan-arguments
fn refusal(message: &str) -> FeatureError {
    FeatureError::usage("plan", message)
}

/// Builds the refusal for arguments that do not follow the grammar.
///
/// Implements: rust-plan/plan-arguments
fn usage() -> FeatureError {
    FeatureError::usage(
        "plan",
        "expected --next [--replan] [--print], <id> [--print] or <name> --brief <file> [--print]",
    )
}
