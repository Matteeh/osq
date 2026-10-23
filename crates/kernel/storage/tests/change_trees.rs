//! Proves the listing of a project's change folders across worktree trees.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    ChangeEntry, ChangeTree, Location, TreeCandidate, change_trees, list_changes, list_tree_changes,
};

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("change_trees")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Creates a folder, creating its parents.
fn folder(path: &Path) {
    fs::create_dir_all(path).unwrap();
}

/// One worktree candidate on a branch.
fn candidate(path: &Path, branch: &str) -> TreeCandidate {
    TreeCandidate {
        path: path.to_path_buf(),
        branch: Some(branch.to_owned()),
    }
}

/// The root and named folder of every tree, for comparison.
fn shape(trees: &[ChangeTree]) -> Vec<(PathBuf, Option<String>)> {
    trees
        .iter()
        .map(|tree| (tree.root.clone(), tree.folder.clone()))
        .collect()
}

/// The `openspec/changes` folder of one tree.
fn changes(root: &Path) -> PathBuf {
    root.join("openspec").join("changes")
}

/// Proves every row of the "Trees of a project" table.
///
/// Covers: rust-storage/trees-of-a-project
#[test]
fn trees_of_a_project() {
    let rows = [
        ("approved", "osq/002-b", "approved", false, true),
        ("archived", "osq/002-b", "archived", false, true),
        ("unapproved", "osq/002-b", "plain", false, false),
        ("off_branch", "main", "approved", false, false),
        ("project_root", "osq/002-b", "approved", true, false),
    ];
    for (name, branch, holds, at_root, added) in rows {
        let root = temp_root(name);
        let worktree = if at_root {
            root.clone()
        } else {
            root.join("wt-a")
        };
        folder(&worktree);
        let changes = changes(&worktree);
        match holds {
            "approved" => write(&changes.join("002-b/.run/approved"), ""),
            "archived" => folder(&changes.join("archive/002-b")),
            _ => folder(&changes.join("002-b")),
        }
        let trees = change_trees(&root, &[candidate(&worktree, branch)], &[]);
        let expected = if added {
            vec![
                (root.clone(), None),
                (worktree.clone(), Some(String::from("002-b"))),
            ]
        } else {
            vec![(root.clone(), None)]
        };
        assert_eq!(shape(&trees), expected, "row {name}");
    }
}

/// Proves a stacked folder no worktree names becomes a tree of its own.
///
/// Covers: rust-storage/stacked-trees
#[test]
fn stacked_trees() {
    let root = temp_root("stacked_trees");
    let worktree = root.join("wt-a");
    write(&changes(&worktree).join("002-b/.run/approved"), "");
    let stacked = root.join(".stacked");
    folder(&stacked.join("002-b"));
    folder(&stacked.join("003-c"));
    let trees = change_trees(
        &root,
        &[candidate(&worktree, "osq/002-b")],
        &[stacked.join("002-b"), stacked.join("003-c")],
    );
    let expected = vec![
        (root.clone(), None),
        (worktree.clone(), Some(String::from("002-b"))),
        (stacked.join("003-c"), Some(String::from("003-c"))),
    ];
    assert_eq!(shape(&trees), expected);
}

/// Proves each change comes from the tree that owns it, once and in order.
///
/// Covers: rust-storage/changes-across-trees
#[test]
fn changes_across_trees() {
    let root = temp_root("changes_across_trees");
    let second = root.join("wt-b");
    let third = root.join("wt-c");
    folder(&changes(&root).join("001-a"));
    folder(&changes(&root).join("002-b"));
    folder(&changes(&root).join("archive/000-z"));
    folder(&changes(&second).join("002-b"));
    folder(&changes(&second).join("archive/000-z"));
    folder(&changes(&third).join("archive/003-c"));
    let trees = [
        ChangeTree {
            root: root.clone(),
            folder: None,
        },
        ChangeTree {
            root: second.clone(),
            folder: Some(String::from("002-b")),
        },
        ChangeTree {
            root: third.clone(),
            folder: Some(String::from("003-c")),
        },
    ];
    let expected = vec![
        ChangeEntry {
            folder: String::from("001-a"),
            location: Location::Active,
            path: changes(&root).join("001-a"),
        },
        ChangeEntry {
            folder: String::from("002-b"),
            location: Location::Active,
            path: changes(&second).join("002-b"),
        },
        ChangeEntry {
            folder: String::from("000-z"),
            location: Location::Archived,
            path: changes(&root).join("archive/000-z"),
        },
        ChangeEntry {
            folder: String::from("003-c"),
            location: Location::Archived,
            path: changes(&third).join("archive/003-c"),
        },
    ];
    assert_eq!(list_tree_changes(&trees), expected);
}

/// Proves a project root alone lists exactly what `list_changes` lists.
///
/// Covers: rust-storage/root-alone
#[test]
fn root_alone() {
    let root = temp_root("root_alone");
    let changes = changes(&root);
    folder(&changes.join("002-b"));
    folder(&changes.join("archive/001-a"));
    folder(&changes.join("rejected/003-c"));
    folder(&changes.join(".hidden"));
    folder(&changes.join("_draft"));
    let trees = [ChangeTree {
        root: root.clone(),
        folder: None,
    }];
    let listed = list_tree_changes(&trees);
    assert_eq!(listed, list_changes(&root));
    let named: Vec<(String, Location)> = listed
        .iter()
        .map(|entry| (entry.folder.clone(), entry.location))
        .collect();
    let expected = [
        (String::from("002-b"), Location::Active),
        (String::from("001-a"), Location::Archived),
        (String::from("003-c"), Location::Rejected),
    ];
    assert_eq!(named, expected);
}

/// Proves a worktree holding the folder in its rejected folder is a tree.
///
/// Covers: rust-storage/trees-of-a-project
#[test]
fn worktree_holds_rejected() {
    let root = temp_root("worktree_holds_rejected");
    let worktree = root.join("wt-a");
    folder(&changes(&worktree).join("rejected/002-b"));
    let trees = change_trees(&root, &[candidate(&worktree, "osq/002-b")], &[]);
    let expected = vec![
        (root.clone(), None),
        (worktree.clone(), Some(String::from("002-b"))),
    ];
    assert_eq!(shape(&trees), expected);
}

/// Proves a worktree with no branch never becomes a tree.
///
/// Covers: rust-storage/trees-of-a-project
#[test]
fn worktree_without_a_branch() {
    let root = temp_root("worktree_without_a_branch");
    let worktree = root.join("wt-a");
    write(&changes(&worktree).join("002-b/.run/approved"), "");
    let candidate = TreeCandidate {
        path: worktree,
        branch: None,
    };
    assert_eq!(
        shape(&change_trees(&root, &[candidate], &[])),
        [(root, None)]
    );
}

/// Proves a named tree's rejected copy falls to the first tree that holds it.
///
/// Covers: rust-storage/changes-across-trees
#[test]
fn rejected_copies_fall_to_the_first_tree() {
    let root = temp_root("rejected_copies");
    let second = root.join("wt-b");
    folder(&changes(&root).join("rejected/004-d"));
    folder(&changes(&second).join("rejected/004-d"));
    folder(&changes(&second).join("rejected/005-e"));
    let trees = [
        ChangeTree {
            root: root.clone(),
            folder: None,
        },
        ChangeTree {
            root: second.clone(),
            folder: Some(String::from("004-d")),
        },
        ChangeTree {
            root: second.clone(),
            folder: Some(String::from("005-e")),
        },
    ];
    let expected = vec![
        ChangeEntry {
            folder: String::from("004-d"),
            location: Location::Rejected,
            path: changes(&root).join("rejected/004-d"),
        },
        ChangeEntry {
            folder: String::from("005-e"),
            location: Location::Rejected,
            path: changes(&second).join("rejected/005-e"),
        },
    ];
    assert_eq!(list_tree_changes(&trees), expected);
}
