## ADDED Requirements

### Requirement: Stacked approvals folder
`stacked_root(vcs: &VcsConfig, repo_root: &Path, home: &Path) -> PathBuf` in
`osq-kernel-vcs` SHALL give the folder that holds one stacked approval per
change, as TypeScript's `stackedPath` gives its parent:
`<worktree root>/<repo_root's last component>/.stacked`. The worktree root
is `vcs.worktree_root`, with a leading `~` alone or `~/` replaced by `home`.
It reads no file.

#### Scenario: Stacked folder paths
- **WHEN** `stacked_root` reads the row's `worktree_root`, the repository root `/work/osq` and the home `/home/me`
- **THEN** it returns the row's folder:

| `worktree_root` | Folder |
|---|---|
| `~/.osq/worktrees` | `/home/me/.osq/worktrees/osq/.stacked` |
| `~` | `/home/me/osq/.stacked` |
| `/srv/trees` | `/srv/trees/osq/.stacked` |
| `~other/trees` | `~other/trees/osq/.stacked` |
