# Tasks

## 1. Tree record

- [x] 1. When osq's own git write adds, removes or prunes a worktree, commits, or lands a fast-forward, it appends one line to the tree record
- [x] 2. When the tree record changes, osq inbox --follow derives and re-reads the trees at once, and its backstop poll defaults to 300 seconds
- [x] 3. When the trees change while osq serve runs, the dashboard watches the new trees and tells connected clients to refetch
