//! Building the environment one verify command sees.

use std::collections::BTreeMap;

use osq_kernel_runners::{EnvRole, role_env};

use super::VerifyRequest;

/// Builds the verify role's environment, then the change and diff variables,
/// then the caller's extras.
pub(super) fn build(request: &VerifyRequest) -> BTreeMap<String, String> {
    let mut env = role_env(
        EnvRole::Verify,
        &request.source_env,
        &request.configured_env,
        &request.agent_env,
        &BTreeMap::new(),
    );
    set_or_remove(&mut env, "OSQ_CHANGE", request.change.as_deref());
    set_or_remove(&mut env, "OSQ_DIFF", request.diff.as_deref());
    for (name, value) in &request.extra_env {
        env.insert(name.clone(), value.clone());
    }
    env
}

/// Sets one variable, or removes it when the request names no value.
fn set_or_remove(env: &mut BTreeMap<String, String>, name: &str, value: Option<&str>) {
    match value {
        Some(value) => {
            env.insert(name.to_owned(), value.to_owned());
        }
        None => {
            env.remove(name);
        }
    }
}
