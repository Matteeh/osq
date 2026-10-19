//! Workspace Node-spawn scan tests.

use osq_kernel_linter::{NodeSpawn, ScanError, workspace_node_spawns};
use std::fs;
use std::path::{Path, PathBuf};

/// The copied fixture workspace.
fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/node-spawn")
}

/// Covers: rust-linter/fixture-workspace
#[test]
fn fixture_workspace_lists_its_spawns() {
    let expected = vec![
        NodeSpawn {
            file: "crates/spawner/src/lib.rs".to_owned(),
            line: 9,
            program: "node".to_owned(),
        },
        NodeSpawn {
            file: "crates/spawner/src/lib.rs".to_owned(),
            line: 14,
            program: "/usr/local/bin/npx".to_owned(),
        },
        NodeSpawn {
            file: "crates/spawner/src/run/mod.rs".to_owned(),
            line: 5,
            program: "openspec.cmd".to_owned(),
        },
    ];
    assert_eq!(
        expected,
        workspace_node_spawns(&fixture_root()).expect("the fixture scans")
    );
}

/// Creates a fresh scratch workspace folder for one case.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("creates the scratch root");
    root
}

/// Writes a root manifest with the given text.
fn write_manifest(root: &Path, text: &str) {
    fs::write(root.join("Cargo.toml"), text).expect("writes the manifest");
}

/// Asserts a manifest error names `path`.
fn assert_manifest_error(error: &ScanError, path: &Path) {
    match error {
        ScanError::Manifest { path: actual, .. } => assert_eq!(path, actual),
        other => panic!("expected a manifest error, got {other:?}"),
    }
}

/// Writes a source file whose call spawns `program` on line 3.
fn write_spawn(path: &Path, program: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("creates the source folder");
    }
    let source =
        format!("//! fixture\nfn main() {{\n    let _ = Command::new(\"{program}\");\n}}\n");
    fs::write(path, source).expect("writes the source");
}

/// Covers: rust-linter/workspace-scan-errors
#[test]
fn workspace_scan_errors() {
    let no_table = scratch("node-spawn-no-table");
    write_manifest(&no_table, "[package]\nname = \"x\"\n");
    let error = workspace_node_spawns(&no_table).expect_err("no workspace table");
    assert_manifest_error(&error, &no_table.join("Cargo.toml"));

    let wildcard = scratch("node-spawn-wildcard");
    write_manifest(&wildcard, "[workspace]\nmembers = [\"crates/*\"]\n");
    let error = workspace_node_spawns(&wildcard).expect_err("a wildcard member");
    assert_manifest_error(&error, &wildcard.join("Cargo.toml"));

    let unreadable = scratch("node-spawn-unreadable");
    write_manifest(&unreadable, "[workspace]\nmembers = [\"crates/one\"]\n");
    let source = unreadable.join("crates/one/src");
    fs::create_dir_all(&source).expect("creates the member");
    fs::write(source.join("lib.rs"), [0xff_u8, 0xfe]).expect("writes invalid UTF-8");
    let error = workspace_node_spawns(&unreadable).expect_err("invalid UTF-8");
    match error {
        ScanError::Read { path, .. } => {
            assert!(
                path.ends_with("crates/one/src/lib.rs"),
                "{}",
                path.display()
            );
        }
        other => panic!("expected a read error, got {other:?}"),
    }

    let no_members = scratch("node-spawn-no-members");
    write_manifest(&no_members, "[workspace]\nresolver = \"3\"\n");
    let error = workspace_node_spawns(&no_members).expect_err("no members array");
    assert_manifest_error(&error, &no_members.join("Cargo.toml"));
}

/// Covers: rust-linter/fixture-workspace
#[test]
fn workspace_stops_after_the_members_array() {
    let root = scratch("node-spawn-members-end");
    write_manifest(
        &root,
        concat!(
            "[workspace]\n",
            "members = [\n",
            "  \"crates/a\",\n",
            "]\n",
            "[package]\n",
            "name = \"crates/late\"\n",
        ),
    );
    write_spawn(&root.join("crates/a/src/lib.rs"), "node");
    write_spawn(&root.join("crates/late/src/lib.rs"), "openspec");
    let spawns = workspace_node_spawns(&root).expect("the workspace scans");
    assert_eq!(1, spawns.len(), "{spawns:?}");
    assert_eq!("crates/a/src/lib.rs", spawns[0].file);
    assert_eq!("node", spawns[0].program);
}

/// Covers: rust-linter/fixture-workspace
#[test]
fn workspace_member_and_file_order() {
    let root = scratch("node-spawn-order");
    write_manifest(
        &root,
        concat!(
            "[workspace]\n",
            "members = [\"crates/zeta\", \"crates/alpha\"] # two members\n",
            "[package]\n",
            "name = \"crates/late\"\n",
        ),
    );
    write_spawn(&root.join("crates/zeta/src/main.rs"), "openspec");
    write_spawn(&root.join("crates/late/src/lib.rs"), "openspec");
    write_spawn(&root.join("crates/alpha/src/a.rs"), "node");
    write_spawn(&root.join("crates/alpha/src/a/mod.rs"), "npx");
    write_spawn(&root.join("crates/alpha/src/b/nested.rs"), "openspec");
    write_spawn(&root.join("crates/alpha/examples/run.rs"), "node");
    write_spawn(&root.join("crates/alpha/tests/api.rs"), "node");
    write_spawn(&root.join("crates/alpha/benches/api.rs"), "node");
    write_spawn(&root.join("crates/alpha/build.rs"), "node");
    fs::write(
        root.join("crates/alpha/src/notes.txt"),
        "Command::new(\"node\")",
    )
    .expect("writes a non-Rust file");
    let spawns = workspace_node_spawns(&root).expect("the workspace scans");
    let names: Vec<(&str, &str)> = spawns
        .iter()
        .map(|spawn| (spawn.file.as_str(), spawn.program.as_str()))
        .collect();
    assert_eq!(
        vec![
            ("crates/zeta/src/main.rs", "openspec"),
            ("crates/alpha/src/a.rs", "node"),
            ("crates/alpha/src/a/mod.rs", "npx"),
            ("crates/alpha/src/b/nested.rs", "openspec"),
        ],
        names
    );
    assert!(spawns.iter().all(|spawn| spawn.line == 3));
}
