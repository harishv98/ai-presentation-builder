# Persistence

Loads the saved deck from IndexedDB at startup and autosaves every change.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 2 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow), and one of the readers of the [deck model](deck-model.md) at the end of every change.

## Files

| File | Purpose |
|---|---|
| `lib/deck/persist.ts` | `restoreDeck()`: load, validate, then start autosave. |

## How it works

**Restore.** `EditorShell` calls `use(restoreDeck())`, so the editor suspends until it resolves. `restoreDeck` is memoized: it runs once per page load no matter how many times it is called.

1. Open the `ai-presentation-builder` database (one object store, `kv`) and read the `deck` key.
2. If nothing is saved, keep the empty deck from `createEmptyDeck()`.
3. Validate with `DeckSchema`. On success, `replaceDeck(parsed)` swaps it in and clears undo history.
4. On failure, log a warning, keep the raw value under `deck-backup` so it can be recovered by hand, and start with an empty deck.
5. Any IndexedDB error is logged and the app starts with an empty deck.

**Autosave.** After restore, a `useDeckStore.subscribe` listener watches the `deck` reference. Every change resets a 300 ms timer; when it fires, the current deck is written to the `deck` key. A burst of edits (a drag, a streaming AI reply) produces one write.

## What is and isn't saved

| Saved | Not saved |
|---|---|
| The deck (slides, elements, title) | Undo history (`past` / `future`) |
| | Selection, current slide, and other [UI state](app-shell.md#useuistore-transient-state) |
| | Chat transcript, model history, generation progress |

Because the deck is the only thing persisted, a reload mid-generation keeps the slides made so far but loses their fill status. "Fill with AI" is unavailable for them after a reload because the outline lives in the generation store.
