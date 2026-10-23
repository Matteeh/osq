#!/bin/sh
# A fake pi for the usage-pause tests: reports an account limit and exits 1,
# writing no file.
printf '%s\n' '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"429 Monthly usage limit reached"}}'
exit 1
