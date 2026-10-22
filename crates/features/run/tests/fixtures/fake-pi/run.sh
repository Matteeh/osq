#!/bin/sh
# A fake pi for the run feature's outcome tests: acts out fake-pi-mode.
mode=$(cat fake-pi-mode 2>/dev/null || true)
result=openspec/changes/001-a/.run/results/1.md
write_result() {
    mkdir -p openspec/changes/001-a/.run/results
    printf '## Changed\n\nA file.\n\nTouched: src/a.txt\n' > "$result"
}
case "$mode" in
    done)
        printf 'a\n' > src/a.txt
        write_result
        ;;
    no-file)
        write_result
        ;;
    breaks-change)
        printf 'a\n' > src/a.txt
        printf 'broken\n' > src/broken.txt
        write_result
        ;;
    no-result)
        printf 'a\n' > src/a.txt
        ;;
    blocked)
        printf 'a\n' > src/a.txt
        mkdir -p openspec/changes/001-a/.run/results
        printf '## Changed\n\nA file.\n\n## Blocked\nneed a key\n' > "$result"
        ;;
    outside)
        printf 'a\n' > src/a.txt
        printf 'outside\n' > other.txt
        write_result
        ;;
    frozen)
        printf 'a\n' > src/a.txt
        printf 'changed\n' > src/tests/old.rs
        write_result
        ;;
    crash)
        exit 3
        ;;
    crash-after-result)
        printf 'a\n' > src/a.txt
        write_result
        exit 3
        ;;
    modify-outside)
        printf 'a\n' > src/a.txt
        printf 'after\n' > other.txt
        write_result
        ;;
    added-test)
        printf 'a\n' > src/a.txt
        printf '//! A new test.\n' > src/tests/new.rs
        write_result
        ;;
    delete-test)
        printf 'a\n' > src/a.txt
        rm -f src/tests/old.rs
        write_result
        ;;
    locks)
        printf 'a\n' > src/a.txt
        printf 'src/Cargo.toml\n' >> src/Cargo.toml
        printf 'lock\n' > Cargo.lock
        printf '{}\n' > src/package.json
        printf '{}\n' > src/package-lock.json
        printf 'lock\n' > src/pnpm-lock.yaml
        printf 'lock\n' > src/yarn.lock
        write_result
        ;;
    hang)
        while :; do
            sleep 0.1
        done
        ;;
esac
exit 0
