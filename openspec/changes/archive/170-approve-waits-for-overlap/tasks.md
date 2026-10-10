# Tasks

## 1. Approve waits for overlap

- [x] 1. When a land or sync test needs two changes cut side by side that share a capability, its approve helper drops overlap lines from the stacked copy
- [x] 2. When an approved change overlaps an unlanded one on a capability, approve stacks it with an overlap line and prints which change it runs after
- [x] 3. When a stacked change's overlapped change is rejected, approved again or archived apart from another, the cut drops the line or waits instead of halting
- [x] 4. When osq show runs for an active change that waits for another, it prints which change it runs after and why
- [x] 5. When the dashboard shows a change that waits for another, its header has a Runs after row naming that change and why
