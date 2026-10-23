//! Proves the run tests' scratch repository carries its own git identity.

mod support;
mod worktree_support;

/// Proves "Worktree test repository identity".
///
/// Covers: rust-run/worktree-test-repository-identity
#[test]
fn worktree_test_repository_identity() {
    let repo = worktree_support::build("identity");
    for root in [&repo.checkout, &repo.worktree] {
        let name = worktree_support::git(root, &["config", "--local", "user.name"]);
        let email = worktree_support::git(root, &["config", "--local", "user.email"]);
        assert_eq!(name.trim(), "Osq Test", "user.name in {}", root.display());
        assert_eq!(
            email.trim(),
            "osq@example.com",
            "user.email in {}",
            root.display()
        );
    }
}
