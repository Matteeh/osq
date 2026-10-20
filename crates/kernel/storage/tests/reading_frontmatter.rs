//! Proves storage reads frontmatter only through the specs kernel's parser.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{frontmatter_string, markdown_body};

/// Proves a document the specs kernel refuses has no key and its whole body.
///
/// Covers: rust-storage/frontmatter-the-specs-kernel-refuses
#[test]
fn refused_frontmatter_reads_as_no_frontmatter() {
    let rows: [&str; 2] = ["---\n- a\n---\nbody", "---\ntitle: a\nb: : :\n---\nbody"];
    for text in rows {
        assert_eq!(frontmatter_string(text, "title"), None, "title of {text:?}");
        assert_eq!(markdown_body(text), text, "body of {text:?}");
    }
}

/// Every `.rs` file under a folder, at any depth.
fn rust_sources(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            files.extend(rust_sources(&path));
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            files.push(path);
        }
    }
    files
}

/// Proves storage holds no YAML parser call of its own.
///
/// Covers: rust-storage/storage-has-no-frontmatter-parser-of-its-own
#[test]
fn yaml_loader_lives_only_in_the_events_reader() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut found: Vec<String> = rust_sources(&root)
        .into_iter()
        .filter(|path| fs::read_to_string(path).unwrap().contains("YamlLoader"))
        .map(|path| {
            path.strip_prefix(&root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/")
        })
        .collect();
    found.sort();
    assert_eq!(found, vec![String::from("read/snapshot/events.rs")]);
}
