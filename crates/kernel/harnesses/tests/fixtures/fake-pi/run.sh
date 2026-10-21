#!/bin/sh
# A fake pi for run tests: writes its arguments, then acts out one mode.
for argument in "$@"; do
    printf '%s\n' "$argument"
done > args.txt
case "${FAKE_PI_MODE:-}" in
    settle)
        printf '%s\n' \
            '{"type":"tool_execution_start","toolCallId":"c1","toolName":"write","args":{"path":"notes.md"}}' \
            '{"type":"tool_execution_end","toolCallId":"c1","toolName":"write","isError":false}' \
            '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}' \
            '{"type":"agent_settled"}'
        trap 'exit 143' TERM
        i=0
        while [ "$i" -lt 100 ]; do sleep 0.1; i=$((i+1)); done
        ;;
    settle-stubborn)
        printf '%s\n' \
            '{"type":"tool_execution_start","toolCallId":"c1","toolName":"write","args":{"path":"notes.md"}}' \
            '{"type":"tool_execution_end","toolCallId":"c1","toolName":"write","isError":false}' \
            '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}' \
            '{"type":"agent_settled"}'
        trap '' TERM
        i=0
        while [ "$i" -lt 100 ]; do sleep 0.1; i=$((i+1)); done
        ;;
    settled-with-stderr)
        printf '%s\n' '{"type":"agent_settled"}'
        printf '%s\n' 'noise' >&2
        exit 2
        ;;
    missing-key)
        printf '%s\n' 'No API key found for deepseek.' >&2
        exit 1
        ;;
    fail)
        printf '%s\n' 'boom' >&2
        exit 2
        ;;
    hang)
        i=0
        while [ "$i" -lt 100 ]; do sleep 0.1; i=$((i+1)); done
        ;;
esac
exit 0
