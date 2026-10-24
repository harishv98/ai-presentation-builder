# Stage 8: Persistence and PDF Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** The deck survives a refresh, and an **Export PDF** button opens the browser print dialog with one 1600×900 page per slide, charts and images where they sit on the canvas.

**Architecture:** No new dependencies, no new routes, no schema or op changes. One new module, `src/lib/deck/persist.ts`, uses raw IndexedDB: it loads the saved deck once before the editor renders (React 19 `use()` under `Suspense`), then saves the deck 300 ms after it last changed. A saved deck that fails `DeckSchema` is copied to a backup key and the app starts empty. Export renders every slide with the existing `SlideRenderer` into a print-only portal, waits for images and fonts, calls `window.print()`, and unmounts on `afterprint`. It prints the live store, so a save still waiting on its 300 ms delay never matters.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind 4, Zustand 5, zod 4. No new dependencies.

## Global Constraints

- Only the deck is saved. Undo history, UI state, chat transcript, and generation status are not (design section 4).
- Loading a saved deck uses `replaceDeck` (no undo entry), like the sample deck loader.
- Autosave never runs before the load finishes, so the empty starting deck can't overwrite a saved one.
- Any IndexedDB failure (private mode, blocked, quota) logs a warning and the editor keeps working without saving.

## Decisions introduced in this stage (to confirm)

| # | Decision | Why |
|---|----------|-----|
| S8-a | IndexedDB only, raw API, no localStorage fallback (your choice). One database `ai-presentation-builder`, one object store `kv`, keys `deck` and `deck-backup`. The deck object is stored as is (structured clone), not as a JSON string | Uploaded images are data URLs and can pass localStorage's ~5 MB cap. Every target browser has IndexedDB, so a fallback would be code that never runs |
| S8-b | Save 300 ms after the last deck change. An edit made less than 300 ms before a refresh can be lost | A `pagehide` flush can't be relied on to finish an IndexedDB write anyway |
| S8-c | Invalid saved deck: copy it to `deck-backup`, log a warning, start on the empty deck. No UI notice | Design section 7. The data is kept for debugging; schema changes are rare before stage 9 |
| S8-d | Export happens in the same page, with no `/print` route (your choice, replaces D11's route). **Export PDF** in the header (disabled on an empty deck) and ⌘P both mount a print-only portal of all slides; the editor is `print:hidden` | Prints exactly what is on screen, with no save to wait for and no second page that has to load from storage |
| S8-e | `@page { size: 1600px 900px; margin: 0 }`, one slide per page, and `print-color-adjust: exact` so slide backgrounds and shape fills print | Browsers drop backgrounds in print unless told not to |
| S8-f | New render variant `"print"`. Recharts uses the chart's `id` for SVG clip-path ids; reusing `"thumbnail"` would duplicate the filmstrip's ids, and those resolve to the hidden filmstrip copy | One extra string in a union; it behaves like a thumbnail everywhere else |
| S8-g | The sample deck loader stays as it is: it replaces the deck and clears history (your choice). D16's "temporary until stage 8" note is closed | It only shows on an empty deck, so all it can overwrite is a deck you just cleared with New deck |
| S8-h | Known gaps, accepted: two open tabs overwrite each other (the last save wins); printing during generation prints the slides as they are | Each needs locking or coordination code for an edge case |

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/deck/persist.ts` (new) | IndexedDB get/put, `restoreDeck()` (load once, then start autosave) |
| `src/app/page.tsx` (modify) | `Suspense` around the editor, sharing the existing loading fallback |
| `src/components/shell/EditorShell.tsx` (modify) | `use(restoreDeck())`, `print:hidden` root, Export PDF button |
| `src/components/shell/PrintDeck.tsx` (new) | `printDeck()` trigger plus the print portal |
| `src/components/slide/elements/ElementView.tsx` (modify) | `"print"` in `RenderVariant` |
| `src/components/shell/useEditorShortcuts.ts` (modify) | ⌘P calls `printDeck()` |
| `src/app/globals.css` (modify) | `@page` and print rules |

---

## Task 1: Autosave and restore

**Files:** `src/lib/deck/persist.ts` (new), `src/app/page.tsx`, `src/components/shell/EditorShell.tsx`

- [ ] **Step 1: Persistence module.** New `src/lib/deck/persist.ts`:

```ts
import { DeckSchema } from "./schema";
import { useDeckStore } from "./store";

const DB_NAME = "ai-presentation-builder";
const STORE = "kv";
const DECK_KEY = "deck";
const BACKUP_KEY = "deck-backup";
const SAVE_DELAY_MS = 300;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadSavedDeck(): Promise<void> {
  const saved: unknown = await run("readonly", (store) => store.get(DECK_KEY));
  if (saved === undefined) return;
  const parsed = DeckSchema.safeParse(saved);
  if (parsed.success) {
    useDeckStore.getState().replaceDeck(parsed.data);
    return;
  }
  console.warn("Saved deck failed validation; starting fresh. Raw copy kept under", BACKUP_KEY, parsed.error);
  await run("readwrite", (store) => store.put(saved, BACKUP_KEY));
}

function startAutosave(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  useDeckStore.subscribe((state, prev) => {
    if (state.deck === prev.deck) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      run("readwrite", (store) => store.put(useDeckStore.getState().deck, DECK_KEY)).catch((error) =>
        console.warn("Autosave failed", error),
      );
    }, SAVE_DELAY_MS);
  });
}

let restoring: Promise<void> | undefined;

export function restoreDeck(): Promise<void> {
  restoring ??= loadSavedDeck()
    .catch((error) => console.warn("Could not load the saved deck", error))
    .then(startAutosave);
  return restoring;
}
```

The cached promise makes `restoreDeck()` safe under React StrictMode and re-renders: one load, one subscription. Autosave starts even when loading fails, because a later save may still work (for example after a transient lock).

- [ ] **Step 2: Gate the editor.** In `src/app/page.tsx`, pull the fallback into a constant and wrap the editor in `Suspense`:

```tsx
import { Suspense } from "react";
import { ClientOnly } from "@/components/shell/ClientOnly";
import { EditorShell } from "@/components/shell/EditorShell";

const loading = <div className="flex h-screen items-center justify-center text-sm text-zinc-400">Loading editor…</div>;

export default function Home() {
  return (
    <ClientOnly fallback={loading}>
      <Suspense fallback={loading}>
        <EditorShell />
      </Suspense>
    </ClientOnly>
  );
}
```

In `EditorShell`, make `use(restoreDeck());` the first line (before `useEditorShortcuts()`). Imports: `use` from `react`, `restoreDeck` from `@/lib/deck/persist`.

- [ ] **Step 3: Check.** `npm run lint` and `npx tsc --noEmit` pass.
  1. Fresh profile (or DevTools > Application > IndexedDB > delete `ai-presentation-builder`): the app opens on the empty deck as before.
  2. Load the sample deck, move the chart, rename a slide, refresh: everything is still there and Undo is disabled.
  3. Generate a deck (replay mode), refresh: the deck is back. Insert an uploaded image, refresh: it's still there.
  4. Click New deck, refresh: the empty deck shows with the prompt box.
  5. In DevTools, edit the stored `deck` value so it is invalid (for example, set `nextId` to `"x"`), refresh: the empty deck shows, the console has the warning, and `deck-backup` holds the broken value.
  6. In a private window the editor still works; the console shows a warning if IndexedDB is unavailable.

- [ ] **Step 4: Commit.** `feat(deck): autosave the deck to IndexedDB and restore it on load`

---

## Task 2: Export PDF

**Files:** `src/components/slide/elements/ElementView.tsx`, `src/components/shell/PrintDeck.tsx` (new), `src/components/shell/EditorShell.tsx`, `src/components/shell/useEditorShortcuts.ts`, `src/app/globals.css`

- [ ] **Step 1: Render variant.** In `ElementView.tsx`: `export type RenderVariant = "canvas" | "thumbnail" | "print";`. Nothing else changes: `ChartView` already folds the variant into its id, and `TextView` and `SlideRenderer` only special-case `"canvas"`.

- [ ] **Step 2: Print portal.** New `src/components/shell/PrintDeck.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { SlideRenderer } from "@/components/slide/SlideRenderer";
import { useDeckStore } from "@/lib/deck/store";

const usePrintStore = create<{ printing: boolean }>(() => ({ printing: false }));

export function printDeck(): void {
  if (useDeckStore.getState().deck.slideOrder.length > 0) usePrintStore.setState({ printing: true });
}

export function PrintDeck() {
  const printing = usePrintStore((s) => s.printing);
  const slideOrder = useDeckStore((s) => s.deck.slideOrder);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!printing) return;
    const done = () => usePrintStore.setState({ printing: false });
    window.addEventListener("afterprint", done, { once: true });
    const images = [...(ref.current?.querySelectorAll("img") ?? [])];
    Promise.all([document.fonts.ready, ...images.map((img) => img.decode().catch(() => {}))]).then(() => window.print());
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  if (!printing) return null;
  return createPortal(
    <div ref={ref} className="print-deck">
      {slideOrder.map((id) => (
        <SlideRenderer key={id} slideId={id} variant="print" />
      ))}
    </div>,
    document.body,
  );
}
```

`img.decode()` rejects for a broken image; the catch keeps a missing picture from blocking the print.

- [ ] **Step 3: Print CSS.** Append to `src/app/globals.css`:

```css
.print-deck {
  position: fixed;
  left: -100000px;
}

@media print {
  @page {
    size: 1600px 900px;
    margin: 0;
  }

  .print-deck {
    position: static;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .print-deck > * {
    break-after: page;
  }
}
```

Off-screen (not `display: none`) on screen, so images load and decode before printing.

- [ ] **Step 4: Wire it up.** In `EditorShell`:
  - Add `print:hidden` to the root `div` (`flex h-screen flex-col print:hidden`).
  - Render `<PrintDeck />` as the root div's sibling, wrapping both in a fragment.
  - Add an **Export PDF** button next to `<HistoryButtons />`, styled like `NewDeckButton`, `onClick={printDeck}`, `disabled` when the deck is empty, `title="Save as PDF from the print dialog (⌘P)"`.

In `useEditorShortcuts`, before the `mod && key === "z"` branch:

```ts
if (mod && key === "p") {
  event.preventDefault();
  printDeck();
  return;
}
```

Import `printDeck` from `./PrintDeck`. ⌘P inside a text field keeps the browser default (blank page), because the shortcut handler returns early for editable targets; that is acceptable.

- [ ] **Step 5: Check.** `npm run lint` and `npx tsc --noEmit` pass. On the sample deck and on a generated deck:
  1. Click Export PDF: the print dialog opens with one landscape page per slide, in filmstrip order, with no editor chrome.
  2. Charts, tables, and images sit where they are on the canvas; slide backgrounds and shape fills are colored; chart lines and bars are not clipped.
  3. An uploaded image and an AI (proxied) image both appear.
  4. Cancel the dialog: the editor is unchanged and Export PDF works again. ⌘P does the same.
  5. "Save as PDF" produces a file whose page size is 16:9 with no white margins (Chrome; Safari may add its own margins, note it if so).
  6. On an empty deck the button is disabled and ⌘P does nothing.

- [ ] **Step 6: Commit.** `feat(export): print the deck to PDF, one slide per page`

---

## Task 3: Decisions note

- [ ] **Step 1:** In `docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md`:
  - D11: "Print-to-PDF in the same page (Export PDF button or ⌘P mounts a print-only render of all slides)" instead of the `/print` route.
  - D16: drop "a temporary regression/demo reset kept until persistence lands in stage 8"; it stays as is.
  - Section 4 persistence bullet: "debounced (300 ms) subscribe → IndexedDB; zod-validated on load" (no localStorage fallback).
  - Section 6 Export bullet: match D11.
  - Add any decision that changed during the checklist to the table above.
- [ ] **Step 2: Commit.** `docs: stage 8 decisions`
