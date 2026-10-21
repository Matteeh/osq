//! Proves the settings a land refuses before it reads the changes.

mod support;

use osq_core::FeatureError;
use support::LandRepo;

/// The `osq.toml` rows of "Settings refusals".
const ENABLED_FALSE: &str = "[vcs]\nenabled = false\n";
/// An enabled `vcs` block with no author.
const ENABLED_TRUE: &str = "[vcs]\nenabled = true\n";

/// Proves every row of "Settings refusals".
///
/// Covers: rust-land/settings-refusals
#[test]
fn settings_refusals() {
    let rows: [(&str, Option<&str>, &str); 3] = [
        ("no osq.toml", None, "osq land needs vcs.enabled and git"),
        (
            "vcs disabled",
            Some(ENABLED_FALSE),
            "osq land needs vcs.enabled and git",
        ),
        (
            "author required",
            Some(ENABLED_TRUE),
            "vcs.author is required when vcs.enabled is true",
        ),
    ];
    for (index, (name, toml, expected)) in rows.into_iter().enumerate() {
        let repo = LandRepo::new(&format!("settings-{index}"));
        repo.add_fixture_change();
        match toml {
            Some(text) => repo.write(repo.checkout(), "osq.toml", text),
            None => {
                std::fs::remove_file(repo.checkout().join("osq.toml"))
                    .expect("osq.toml is removed");
            }
        }
        let before = repo.head(repo.checkout());
        let error = repo.run("1").expect_err("the land fails");
        assert_eq!(
            error.to_string(),
            format!("land failed: {expected}"),
            "{name}"
        );
        match &error {
            FeatureError::Failed { command, .. } => assert_eq!(command, "land", "{name}"),
            other => panic!("{name}: expected a failed error, got {other:?}"),
        }
        assert_eq!(repo.head(repo.checkout()), before, "{name}: HEAD unchanged");
    }
}
