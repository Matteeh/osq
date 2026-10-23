#!/bin/sh
# A fake pi for the run attempt tests: saves the prompt it is given beside the
# project folder, then writes a file and the result the done mode writes.
prompt=
for arg in "$@"; do
    prompt=$arg
done
project=$(pwd)
parent=$(dirname "$project")
name=$(basename "$project")
printf '%s' "$prompt" > "$parent/$name.prompt"
printf 'a\n' > src/a.txt
result=openspec/changes/001-a/.run/results/1.md
mkdir -p openspec/changes/001-a/.run/results
printf '## Changed\n\nA file.\n\nTouched: src/a.txt\n' > "$result"
exit 0
