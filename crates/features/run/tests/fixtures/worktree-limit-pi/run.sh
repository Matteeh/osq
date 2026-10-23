#!/bin/sh
# A fake pi for the worktree usage-pause tests: writes a file outside the
# change folder, then reports an account limit and exits 1.
printf 'a\n' > src/a.txt
printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"429 Monthly usage limit reached"}}'
exit 1
