# Deck model

The document: its schema, the operations that change it, the store that holds it, and undo history. Every writer in the app, human or AI, goes through `applyOps`.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 8 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow), the point where every path converges. Writers: [canvas editing](canvas-editing.md), the [filmstrip](filmstrip.md), [cross-slide drag](cross-slide-drag.md), shortcuts, and AI tools via the [agent runtime](agent-runtime.md). Readers: [rendering](rendering.md), [persistence](persistence.md), the AI snapshot, and [PDF export](pdf-export.md).

## Files

| File | Purpose |
|---|---|
| `lib/deck/schema.ts` | Zod schemas and inferred types for `Deck`, `Slide`, `Element`, `Box`, and each payload. |
| `lib/deck/ops.ts` | `Op` (11 operations) and `applyOpsToDeck`. |
| `lib/deck/store.ts` | `useDeckStore`: `deck`, `past`, `future`, `applyOps`, `undo`, `redo`, `replaceDeck`. Also `createEmptyDeck`. |
| `lib/deck/history.ts` | `Txn` records, merging by `txnId`, and the 100-entry cap. |
| `lib/deck/elements.ts` | Per-element-type registry: `describe` (AI snapshot line), `merge` (apply a patch), `visual` (used by auto-arrange), `activate` (double-click behaviour). |
| `lib/deck/geometry.ts` | `isFiniteBox`, `clampBox` (keeps elements on the artboard with a minimum size). |
| `lib/deck/constants.ts` | Artboard size (1600×900), minimum element size, chart palette. |

## Schema

The deck is normalized:

```text
Deck
├── id, title, theme ("default"), aspectRatio ("16:9")
├── slideOrder: string[]                 order of slides
├── slides:   Record<id, Slide>
│     └── id, title, layout, background.color, notes,
│         elementOrder: string[]         z-order, back to front
├── elements: Record<id, Element>
│     └── id, slideId, box {x, y, w, h}, type + payload
└── nextId: number                       source of ids such as s3, e12
```

`Element` is a discriminated union on `type`:

| Type | Payload |
|---|---|
| `text` | `role` (title, subtitle, body, bullets, numbered), `content: string[]` (one entry per paragraph or bullet), `style` (font size, bold, italic, align, color) |
| `image` | `src`, `alt`, `fit` (cover or contain) |
| `chart` | `kind` (bar, line, pie, area, stacked-bar), `title`, `categories`, `series[]`, `showLegend`, axis labels |
| `table` | `rows: string[][]`, `headerRow` |
| `shape` | `kind` (rect, ellipse, line), `fill`, `stroke` |

Slide layouts are `title`, `content`, `two-column`, `comparison`, `section`, `chart-forward`, and `blank`. All coordinates are in artboard units (1600×900, origin top-left).

The same Zod definitions validate decks loaded from IndexedDB, AI tool arguments, and API requests. Everything else uses the inferred TypeScript types.

## Operations

| Op | Effect |
|---|---|
| `update_deck` | Set the deck title. |
| `add_slide` | New slide (defaults: "Untitled", `blank`, white) at `index` or the end. |
| `update_slide` | Patch title, layout, background, or notes. |
| `delete_slide` | Remove a slide and all its elements. |
| `reorder_slides` | Move a slide to `toIndex`. |
| `duplicate_slide` | Deep-copy a slide and its elements right after it, titled "… (copy)". |
| `add_element` | New element on a slide at `index` (z-order) or on top. |
| `update_element` | Patch the box and/or the payload for the element's own type. A patch for another type fails. |
| `move_element` | Change the box, and optionally move to `toSlideId` (appended on top) or `copy` (clone with a new id). |
| `delete_element` | Remove an element. |
| `reorder_element` | `forward`, `backward`, `front`, or `back` in z-order. |

`applyOpsToDeck(deck, ops)` runs the whole batch inside one Immer `produceWithPatches`:

- Each op returns `{ ok: true, id? }` or `{ ok: false, error }`. Ops check that their targets exist and that boxes are finite; a failed op makes no change and the rest of the batch still runs.
- Every box written by an op is clamped with `clampBox`.
- Created ids come back in the results, which is how callers select a new element or go to a new slide.
- The batch returns the new deck plus forward and inverse patches.

## Store

```ts
applyOps(ops: Op[], meta: { source: "user" | "ai"; label: string; txnId?: string }): OpResult[]
```

If the batch produced any patches, the store sets the new deck, records a `Txn`, and clears `future`. `replaceDeck` swaps the whole deck and clears history (used by [persistence](persistence.md)).

## Undo history

- A `Txn` stores `label`, `source`, and the batch's patches and inverse patches. Undo applies the inverse patches and redo applies the forward ones; ops are never re-run.
- **Merging.** If `meta.txnId` equals the id of the most recent `Txn`, the new patches are merged into it. This is how one AI reply, one generated deck, one table-cell edit session, or a burst of arrow-key nudges undoes in a single step.
- Merging only works with the most recent entry. If a different change lands in between (for example, the user moves an element while the AI is replying), the AI's later changes start a second entry with the same label.
- History keeps the last 100 entries and is not persisted.
- The undo / redo buttons show the label of the entry they would apply.

## Element registry

`elements.ts` keeps everything type-specific in one place, so adding an element type means one entry here plus a view in [rendering](rendering.md):

| Type | `activate` (double-click / Enter) | `visual` |
|---|---|---|
| `text` | Edit text in place | no |
| `table` | Edit a cell in place | yes |
| `image`, `chart` | Open the Format tab | yes |
| `shape` | Nothing | yes |
