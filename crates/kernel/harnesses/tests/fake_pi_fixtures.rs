//! Fake pi fixtures: the committed programs the harness tests run are executable.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

/// The execute bits the owner, group and other need to run the fake.
const EXECUTE_BITS: u32 = 0o111;

/// Covers: rust-harnesses/fake-pi-programs-run-in-place
#[test]
fn fake_pi_programs_run_in_place() {
    for name in ["preflight.sh", "run.sh"] {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/fake-pi")
            .join(name);
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
}
