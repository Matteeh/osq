---
queue_item: inbox-cards
queue_hash: sha256:1963fc65c40848f3a5e3f2f43183d377bd373e395ca86743d0625889d17f6c12
planner: null
date: 2026-09-27
---

### Goal

On a terminal, `osq inbox` opens the first item as a card with a key for each action. When the action finishes and the item is gone, the next card opens at once. A reviewer does nothing but review.

### Context

- `inbox-dispatch-order` built each item's card data and commands. `inbox-follow-sound` added `--follow`, re-derivation on change, and the sound.
- `osq approve --confirm` already prompts through `node:readline/promises` and refuses without a terminal.

### Requirements

- With a TTY, `osq inbox` shows the first item's card and lists its actions, each with the key that runs it, plus one key that opens the full detail (`osq show`) and one that quits. Without a TTY, it prints as `inbox-dispatch-order` does.
- A key runs the existing command in-process, with its own output shown.
- When the item is gone after its action, the next item's card opens. When it is still there, the same card shows again.
- An empty inbox waits and opens the first item that arrives, with the sound.
- No sound plays while a card is open. A new item waits its turn.

### Non-goals

- New actions.
- Cards in the browser.

### Notes for planning

- Read keys through an injectable input stream, so tests drive the loop without a terminal.
