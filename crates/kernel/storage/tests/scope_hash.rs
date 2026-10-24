//! Proves resolving a task's scope and hashing its files as TypeScript does.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ScopeFile, task_scope_hash};

/// The fixture whose `src/` the rows hash against.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/scope-project")
}

/// A fresh temporary folder for one row, with nothing left at its name.
fn temp_folder(name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("scope_hash")
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    folder
}

/// Copies every file below `from` into `to`, keeping the bytes as they are.
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap().flatten() {
        let path = entry.path();
        let target = to.join(entry.file_name());
        if path.is_dir() {
            copy_tree(&path, &target);
        } else {
            fs::copy(&path, &target).unwrap();
        }
    }
}

/// A fresh copy of the fixture for one row.
fn project(name: &str) -> PathBuf {
    let root = temp_folder(name);
    copy_tree(&fixture(), &root);
    root
}

/// One row of "Scope hash of a task's entries".
struct Row {
    /// The row's folder name.
    name: &'static str,
    /// The scope entries.
    entries: &'static [&'static str],
    /// The expected combined hash.
    hash: &'static str,
    /// The expected files, in order.
    files: &'static [(&'static str, Option<&'static str>)],
}

/// Every row of "Scope hash of a task's entries".
const ROWS: [Row; 14] = [
    Row {
        name: "outside",
        entries: &["../outside.txt"],
        hash: "sha256:985bc8dcecaee4913c191e1d3b327a931d48951f486500edd41ab73a57918030",
        files: &[("../outside.txt", None)],
    },
    Row {
        name: "absolute",
        entries: &["/abs/file.txt"],
        hash: "sha256:d84705e84283af54e8d2e9a3d8f1a7f34c018c3aeb577b80d8186dd3577d841a",
        files: &[("/abs/file.txt", None)],
    },
    Row {
        name: "outside-globs",
        entries: &["../*.txt", "/abs/*.txt"],
        hash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        files: &[],
    },
    Row {
        name: "directory",
        entries: &["src"],
        hash: "sha256:7aaf195b39732b39c116a660cd4ffe54eae09e8fc8a4970b2d7e295e68ad4892",
        files: &[("src", None)],
    },
    Row {
        name: "missing",
        entries: &["src/missing.txt"],
        hash: "sha256:1806de8892c7ca6bae45404c910a7d99b7218bbdbb988a01339e809e98c0f1dc",
        files: &[("src/missing.txt", None)],
    },
    Row {
        name: "backslash",
        entries: &[r".\src\one.txt"],
        hash: "sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06",
        files: &[(
            "src/one.txt",
            Some("sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae"),
        )],
    },
    Row {
        name: "duplicates",
        entries: &["src/one.txt", "./src/one.txt"],
        hash: "sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06",
        files: &[(
            "src/one.txt",
            Some("sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae"),
        )],
    },
    Row {
        name: "trimmed",
        entries: &[" src/two/a.txt "],
        hash: "sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d",
        files: &[(
            "src/two/a.txt",
            Some("sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7"),
        )],
    },
    Row {
        name: "one-level-glob",
        entries: &["src/two/*"],
        hash: "sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d",
        files: &[(
            "src/two/a.txt",
            Some("sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7"),
        )],
    },
    Row {
        name: "question-mark",
        entries: &["src/two/deep/?.txt"],
        hash: "sha256:3515f8747e9ad61510ae928351f0d194a568fb85538f2a36a8cf865bcc42f53a",
        files: &[(
            "src/two/deep/b.txt",
            Some("sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f"),
        )],
    },
    Row {
        name: "trailing-slash",
        entries: &["src/two/"],
        hash: "sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342",
        files: &[
            (
                "src/two/a.txt",
                Some("sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7"),
            ),
            (
                "src/two/deep/b.txt",
                Some("sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f"),
            ),
        ],
    },
    Row {
        name: "recursive-glob",
        entries: &["src/two/**/*.txt"],
        hash: "sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342",
        files: &[
            (
                "src/two/a.txt",
                Some("sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7"),
            ),
            (
                "src/two/deep/b.txt",
                Some("sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f"),
            ),
        ],
    },
    Row {
        name: "folder-glob",
        entries: &["src/**"],
        hash: "sha256:d21bc7711678dcf1a2bd9bc1c5e7be5282b4baa70f6d001ba39ab0937d5ef4ac",
        files: &[
            (
                "src/one.txt",
                Some("sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae"),
            ),
            (
                "src/two/a.txt",
                Some("sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7"),
            ),
            (
                "src/two/deep/b.txt",
                Some("sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f"),
            ),
        ],
    },
    Row {
        name: "empty-scope",
        entries: &[],
        hash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        files: &[],
    },
];

/// The expected hash for one row.
fn expected(row: &Row) -> osq_kernel_storage::ScopeHash {
    osq_kernel_storage::ScopeHash {
        hash: row.hash.to_owned(),
        files: row
            .files
            .iter()
            .map(|(path, hash)| ScopeFile {
                path: (*path).to_owned(),
                hash: hash.map(ToOwned::to_owned),
            })
            .collect(),
    }
}

/// Proves every row of "Scope hash of a task's entries".
///
/// Covers: rust-storage/scope-hash-of-a-task-s-entries
#[test]
fn scope_hash_of_a_task_s_entries() {
    for row in &ROWS {
        let root = project(&format!("scope_{}", row.name));
        let entries: Vec<String> = row
            .entries
            .iter()
            .map(|entry| (*entry).to_owned())
            .collect();
        assert_eq!(
            task_scope_hash(&root, &entries),
            expected(row),
            "{}",
            row.name
        );
    }
}

/// Proves an outside pattern and an outside exact entry give nothing to read.
///
/// Covers: rust-storage/scope-hash-of-a-task-s-entries
#[test]
fn scope_outside_roots_and_entries_give_no_hash() {
    let outer = temp_folder("outside_roots");
    let project = outer.join("project");
    fs::create_dir_all(project.join("src")).unwrap();
    fs::write(project.join("src/one.txt"), "one\n").unwrap();
    fs::write(outer.join("outside.txt"), "out\n").unwrap();
    fs::create_dir_all(outer.join("sub")).unwrap();
    fs::write(outer.join("sub/inside.txt"), "in\n").unwrap();
    fs::write(outer.join("abs.txt"), "abs\n").unwrap();
    for pattern in ["../*.txt", "../sub/*.txt"] {
        let hash = task_scope_hash(&project, &[pattern.to_owned()]);
        assert!(hash.files.is_empty(), "{pattern:?} escapes the project");
    }
    let absolute = outer.join("abs.txt");
    let absolute = absolute.to_string_lossy().into_owned();
    for entry in ["../outside.txt", absolute.as_str()] {
        let hash = task_scope_hash(&project, &[entry.to_owned()]);
        assert_eq!(hash.files.len(), 1, "{entry:?} gives one result");
        assert_eq!(hash.files[0].path, entry, "{entry:?} gives itself");
        assert!(hash.files[0].hash.is_none(), "{entry:?} has no hash");
    }
}
