# Rendering

One slide renderer shared by the canvas, filmstrip thumbnails, the cross-slide drag ghost, and PDF export, so every surface shows the same thing.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 9 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow): the main reader of the [deck model](deck-model.md). Any change from any writer re-renders the affected slides everywhere.

## Files

| File | Purpose |
|---|---|
| `components/slide/SlideRenderer.tsx` | Draws one slide's background and elements in z-order at artboard coordinates. |
| `components/slide/ScaledArtboard.tsx` | Scales the 1600×900 artboard with a CSS transform and exposes `--artboard-scale`. |
| `components/slide/elements/ElementView.tsx` | Picks the view for an element's type. Memoized. |
| `components/slide/elements/TextView.tsx` | Paragraphs, bullets, or numbered lists with the element's text style. |
| `components/slide/elements/ImageView.tsx` | `<img>` with `cover` or `contain`. |
| `components/slide/elements/ChartView.tsx` | Recharts bar, line, pie, area, and stacked bar, with title, legend, and axis labels. |
| `components/slide/elements/TableView.tsx` | Table with optional header row; cells carry `data-cell` for in-place editing. |
| `components/slide/elements/ShapeView.tsx` | Rectangle, ellipse, or line. |

## `SlideRenderer`

```tsx
<SlideRenderer slideId variant="canvas" | "thumbnail" | "print" previewBoxes? hiddenId? />
```

- Reads the slide's background and its elements (in `elementOrder`) with a `useShallow` selector, so it re-renders only when that slide's element objects change. Immer's structural sharing keeps untouched elements referentially equal.
- Each element is absolutely positioned at its box, with `zIndex` from its position in `elementOrder`, and carries `data-element-id` for canvas hit-testing.
- `previewBoxes` (from the in-progress drag) override stored boxes, which is how a drag shows without touching the deck.
- `hiddenId` hides the element whose text editor is open on top of it.

| Variant | Used by | Differences |
|---|---|---|
| `canvas` | `CanvasStage` | Hover outline; empty text shows an "Empty text" placeholder. |
| `thumbnail` | `SlideThumbnail` | No hover affordances. |
| `print` | `PrintDeck` | No hover affordances. |

## Scaling

Everything inside the renderer is in artboard units; only the outer wrapper is scaled:

| Surface | Scale |
|---|---|
| Canvas | Fit to the window by `ArtboardViewport` |
| Thumbnails | 224 / 1600 |
| Cross-slide ghost | The canvas scale, capped at the thumbnail scale |
| Print | 1 (each page is 1600×900 px) |

`--artboard-scale` lets overlays and outlines divide by the scale to keep a constant on-screen width (for example, `outlineWidth: calc(1.5px / var(--artboard-scale))`).

## Adding an element type

Add the schema to `ElementSchema`, an entry to the [element registry](deck-model.md#element-registry), and a view here registered in `ElementView`. The canvas, thumbnails, ghost, and print pick it up automatically.
