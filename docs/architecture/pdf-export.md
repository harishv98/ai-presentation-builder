# PDF export

"Export PDF" (or ⌘P) prints the deck one slide per page using the browser's print dialog, so "Save as PDF" produces the file.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 10 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow): a reader of the [deck model](deck-model.md) that reuses the shared [renderer](rendering.md).

## Files

| File | Purpose |
|---|---|
| `components/shell/PrintDeck.tsx` | `printDeck()` and the `PrintDeck` portal. |
| `src/app/globals.css` | `.print-deck` and the `@media print` rules. |
| `components/shell/EditorShell.tsx` | The editor root has Tailwind's `print:hidden`. |

## How it works

1. `printDeck()` sets `printing` in a small local Zustand store (only if the deck has slides).
2. `PrintDeck` portals one `<SlideRenderer variant="print">` per slide, in `slideOrder`, into `document.body`. On screen, `.print-deck` is positioned far off-screen so nothing flashes.
3. An effect waits for `document.fonts.ready` and for every `<img>` in the portal to decode (failures are ignored), then calls `window.print()`.
4. The `afterprint` event clears `printing`, which unmounts the portal.

## Print CSS

```css
@media print {
  @page { size: 1600px 900px; margin: 0; }
  .print-deck { position: static; print-color-adjust: exact; }
  .print-deck > * { break-after: page; }
}
```

The editor is hidden by `print:hidden`, each slide is exactly one 1600×900 page, and backgrounds print as shown. Because the slides are drawn by the same renderer as the canvas, the PDF matches what the user sees.

## Limits

- Output depends on the browser's print engine; the user must pick "Save as PDF" in the dialog.
- Images that fail to load print as broken images rather than blocking export.
