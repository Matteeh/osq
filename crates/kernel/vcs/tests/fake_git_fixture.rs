//! Fake git fixture: the committed program the timeout tests run is executable.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

/// The fake git script the timeout rows run in place.
const FAKE_GIT: &str =
    "#!/bin/sh\nif [ \"$3\" = \"$OSQ_FAKE_SLOW\" ]; then exec sleep 30; fi\nexit 0\n";

/// The execute bits the owner, group and other need to run the fake.
const EXECUTE_BITS: u32 = 0o111;

/// Covers: rust-vcs/fake-git-runs-in-place
#[test]
fn fake_git_runs_in_place() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-git.sh");
    let text = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{} is unreadable: {error}", path.display()));
    assert_eq!(FAKE_GIT, text, "{} has other text", path.display());
    let mode = fs::metadata(&path)
        .unwrap_or_else(|error| panic!("{} has no metadata: {error}", path.display()))
        .permissions()
        .mode();
    assert_eq!(
        EXECUTE_BITS,
        mode & EXECUTE_BITS,
        "{} is not executable: mode {mode:o}",
        path.display()
    );
}
