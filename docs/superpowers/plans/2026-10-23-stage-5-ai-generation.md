# Stage 5: AI Generation — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Automated tests are deferred to stage 9 (design doc D14); each task ends with a manual check instead.

**Goal:** On an empty deck the user describes a presentation ("Create a 6-slide deck on our Q3 product roadmap with a revenue chart and a comparison table"). The AI first plans the outline with one forced `plan_deck` call. Each slide is added to the deck (as a skeleton with its title) the moment its part of the streamed call is complete, and the title slide starts filling right away. Once the whole outline is in, the other slides are filled by their own small requests, two at a time, and the content lands progressively. Failed or stopped slides can be retried one by one. One ⌘Z removes the whole generated deck.

**Architecture:** Same thin proxy and client-side loop as stage 4. The route gains `mode: "plan" | "populate"`; the server picks the system prompt, tool subset, and `tool_choice` per mode. The client runs `generateDeck`: one plan request whose streamed `plan_deck` arguments are parsed as they arrive, adding each completed slide through `applyOps`; the final call is then executed like any other tool to set the deck title and add anything the stream missed. The title slide's `populateSlide` loop starts as soon as that slide exists; the rest go through a pool of `populateSlide` loops after the outline is complete. Every populate loop is restricted to element, chart, and table tools on its own slide. A pure layout helper arranges each slide's body after every tool call. Progress lives in a small UI-only generation store that the canvas, filmstrip, and chat read.

**Tech Stack:** Next.js 16 route handler, React 19, TypeScript 6, Zustand 5, Immer 11, zod 4. Sarvam `sarvam-105b`. No new npm dependencies.

## Global Constraints

- Every deck mutation goes through `applyOps`. One generation (plan plus every populate) shares one `txnId`, so one ⌘Z removes it all. A per-slide retry is its own undo step.
- The client never chooses the model, tools, system prompt, `tool_choice`, or `max_tokens`; the server derives them from `mode`.
- The AI sees deck state only through the snapshot functions in `src/lib/agent/snapshot.ts`, rebuilt before every request.
- Tool failures never throw into the UI: they become `{ ok: false, error }` tool results and a slide status.
- Generation progress is UI state: not in undo history, not persisted.
- Requests cost Sarvam credits: `reasoning_effort: "low"`, `max_tokens` 3000, populate stops after the first tool round when every call succeeded.
- `next dev` runs with `NODE_USE_SYSTEM_CA=1` exported (D15).
- No new Next.js APIs are used in this stage (one existing route handler). If one becomes necessary, read `node_modules/next/dist/docs/` first (AGENTS.md).
- No automated tests in this stage (D14).

## Decisions introduced in this stage (to confirm)

| # | Decision | Why |
|---|----------|-----|
| S5-a | The app opens on an **empty deck** with a "Create a presentation" prompt box. The stage 1 sample deck stays one click away ("Load the sample deck", which resets undo history). | The reviewer's first step is "prompt: generate a 5–7 slide deck"; starting on the sample deck would make that an edit. Stage 4 fixtures still replay after loading the sample |
| S5-b | Routing: a prompt sent while the deck has **no slides** (from the canvas prompt box or the chat) generates a deck; otherwise it is an edit. A header **New deck** button clears the deck in one undo step to get back to the prompt box. No intent classifier; the edit prompt tells the model to point users at New deck when they ask for a whole new deck | Deterministic, free, and undoable. A classifier costs a request and misroutes "make a slide about…" |
| S5-c | `plan_deck({ title, slides: [{ title, layout, intent, visual }] })`, 3–10 slides, `layout` is any layout except `blank`, `visual` is `chart`, `table`, `image`, or `none`. `theme` is left out (one theme in v1). The plan prompt asks for at least one chart and one table in decks of 5+ slides | `visual` makes the chart and table explicit in the plan, so populate does not have to guess, and the reviewer's "at least one chart and one table" holds |
| S5-d | `plan_deck` is forced with `tool_choice: { type: "function", function: { name: "plan_deck" } }`. If the Task 2 probe shows Sarvam rejects that, fall back to `"required"`, then to `"auto"` with `plan_deck` as the only tool | Stage 0 only tested `"auto"`; the probe costs two tiny requests |
| S5-e | While the plan streams, the client re-scans the partial arguments on every delta. Each slide object inside `slides` that has closed and validates against the slide schema is added to the deck right away (`add_slide` + title box, same `txnId`), so real slides appear in the filmstrip and canvas one by one. The title of the slide still being written shows as one shimmering placeholder after them. When the call ends, `plan_deck` runs as a normal tool: it sets the deck title and adds only the slides not already in the deck. If the final arguments are invalid or the stream breaks, the slides already added are kept and filled; the run fails only when no slide arrived | Streaming is a spec requirement, and `sarvam-105b` streams arguments incrementally (D2). Validating each slide object keeps the store clean without waiting for the whole call |
| S5-e2 | Populate timing: the **title slide** (slide 1 with layout `title`) starts filling the moment it is added, while the plan is still streaming. Every other slide waits until the outline is complete, then goes through the pool | A title slide needs only a subtitle, which doesn't depend on the rest of the outline, so the first content lands in about 2–3 s. Body slides see the full outline, which keeps facts consistent and avoids repeats across slides. Recovery stays simple, and at most 3 streams run at once, briefly |
| S5-f | Populate: one request per slide, two at a time. Tools: `add_element`, `update_element`, `add_chart`, `update_chart_data`, `add_table`, `update_table`, with `tool_choice: "required"` (same fallback as S5-d). The client rejects any call that targets another slide. The snapshot is the whole outline (titles + intents) plus the full contents of the target slide. When every call in the first round succeeds, the slide is done with no follow-up request; otherwise up to 3 rounds to fix errors | Coherent content across slides at about 1 request per slide. Concurrency 2 stays well inside 40 requests/min |
| S5-g | Layout: populate never passes `box`. After each successful tool call, a pure helper arranges the slide's non-title elements by layout: `title`/`section` stack under the hero title; `chart-forward` with chart + text puts them side by side at 2:1; otherwise up to 3 equal columns (text first, then visuals), and 4+ go into a 2-row grid. Subtitles on `title`/`section` slides are centered. Edit mode keeps the stage 4 `placeBox` | Slides look deliberate without trusting model coordinates, and the layout settles as each element lands |
| S5-h | The canvas jumps to slide 1 as soon as it is added and then stays put; populate pulses the touched elements and thumbnails but doesn't follow them | With two slides filling at once, following would make the canvas jump back and forth |
| S5-i | Per-slide status: queued, writing, done, failed, or not filled (after Stop). Empty queued or writing slides show a shimmering skeleton of the planned layout on the canvas and thumbnail; a slide that already has content shows a small "Writing…" badge. Failed and not-filled slides show a strip with **Retry** or **Fill with AI**, and the thumbnail gets a dot | Covers the spec's loading and error states for generation |
| S5-j | Chat: a generation shows as one live progress item (outline while planning, then a row per slide with its status and Retry) instead of one receipt per tool call. The closing sentence is written locally, with no extra request, and stored in chat history so later edits have context | 15–20 receipts would bury the conversation. The summary costs nothing |
| S5-k | `max_tokens` is 3000 for every mode (the cap only limits; tokens are billed as used). Replay fixture names get a `plan-` / `populate-` prefix; edit fixtures keep their names. Generation fixtures replay only after a fresh reload, because slide ids start at `s1` on an empty deck | One knob. Prefixes prevent collisions between modes |

Rough cost of a 7-slide deck on `sarvam-105b`: 1 plan + 7–9 populate requests, about 20k input and 4k output tokens, under ₹1.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/deck/ops.ts` (modify) | New `update_deck` op (deck title) |
| `src/lib/deck/fixture.ts` (modify) | `createEmptyDeck()` |
| `src/lib/deck/store.ts` (modify) | Start empty; `replaceDeck(deck)` |
| `src/lib/slides/actions.ts` (modify) | `startNewDeck()`, `loadSampleDeck()` |
| `src/lib/agent/protocol.ts` (modify) | `AgentMode`, mode enum on the request |
| `src/lib/agent/tools/planTool.ts` | `plan_deck` tool, `PlanDeckArgs`, `PlannedSlide`, `addPlannedSlide()`, `parseStreamedPlan()` |
| `src/lib/agent/tools/index.ts` (modify) | Tool subsets per mode; `findTool(name, mode)` |
| `src/lib/agent/tools/elementTools.ts` (modify) | Center subtitles on hero slides |
| `src/lib/agent/executeTool.ts` (modify) | Mode-aware lookup; reject calls outside the populate slide; export `aiToolContext` |
| `src/lib/server/prompts.ts` (modify) | Plan and populate prompts; New deck hint in the edit prompt |
| `src/lib/server/sarvam.ts` (modify) | Per-mode system prompt, tools, `tool_choice` |
| `src/lib/server/replay.ts`, `src/app/api/chat/route.ts` (modify) | Mode prefix in fixture names |
| `src/lib/agent/sse.ts` (modify) | Optional `onText`, new `onToolArgs` callback |
| `src/lib/agent/agentRequest.ts` | `streamStep()`, `AgentRequestError`, `describeError()` (moved out of `runAgent.ts`) |
| `src/lib/agent/runAgent.ts` (modify) | Uses `streamStep` and `pushNotice` |
| `src/lib/agent/arrange.ts` | `bodyElements()`, `arrangeBoxes()`, `arrangeSlide()` |
| `src/lib/agent/snapshot.ts` (modify) | `serializeForPopulate()` |
| `src/lib/agent/reveal.ts` (modify) | `follow` option |
| `src/lib/generation/store.ts` | Generation phase, title of the slide being outlined, outline, per-slide status |
| `src/lib/agent/populateSlide.ts` | One slide's populate loop |
| `src/lib/agent/generateDeck.ts` | `generateDeck()`, `fillSlide()`, concurrency pool |
| `src/lib/agent/sendPrompt.ts` | Empty deck → generate, else edit |
| `src/lib/chat/store.ts` (modify) | `generation` chat item, `pushNotice()` |
| `src/lib/agent/devtools.ts` (modify) | `agent.generate`, `agent.fill` |
| `src/components/generation/EmptyDeck.tsx` | Prompt box empty state |
| `src/components/generation/PlanningState.tsx` | Canvas while planning |
| `src/components/generation/GenerationProgress.tsx` | Live chat progress item |
| `src/components/canvas/SlideFillOverlay.tsx` | Skeleton, "Writing…" badge, Retry strip |
| `src/components/filmstrip/FillBadge.tsx` | Thumbnail shimmer and status dot |
| `src/components/filmstrip/Filmstrip.tsx`, `SlideThumbnail.tsx`, `canvas/CanvasStage.tsx`, `shell/EditorShell.tsx`, `chat/ChatComposer.tsx`, `chat/ChatTranscript.tsx`, `app/globals.css` (modify) | Wiring, New deck button, shimmer keyframes |
| `fixtures/agent/plan-*.sse`, `fixtures/agent/populate-*.sse` | Recorded generation |

---

### Task 1: Empty start, deck title op, New deck, sample loader

**Files:**

- Modify: `src/lib/deck/ops.ts`, `src/lib/deck/fixture.ts`, `src/lib/deck/store.ts`, `src/lib/slides/actions.ts`

**Interfaces:**

- Consumes: existing `applyOps`, `createSampleDeck`.
- Produces:
  - Op `{ op: "update_deck"; patch: { title?: string } }`
  - `createEmptyDeck(): Deck` (title "Untitled deck", `nextId: 1`)
  - `useDeckStore.getState().replaceDeck(deck: Deck): void` (clears past/future)
  - `startNewDeck(): void`, `loadSampleDeck(): void` (Task 3 Step 12 adds a `resetGeneration()` call to both)

- [ ] **Step 1:** `update_deck` **op** — in `src/lib/deck/ops.ts`, add to the `Op` union after `add_slide`:

```ts
  | { op: "update_deck"; patch: { title?: string } }
```

and add the case to `applyOne` before `case "add_slide"`:

```ts
    case "update_deck": {
      if (op.patch.title !== undefined) draft.title = op.patch.title;
      return ok();
    }
```

- [ ] **Step 2: Empty deck factory** — in `src/lib/deck/fixture.ts`, add above `createSampleDeck` and use it inside:

```ts
export function createEmptyDeck(): Deck {
  return {
    id: "deck-1",
    title: "Untitled deck",
    theme: "default",
    aspectRatio: "16:9",
    slideOrder: [],
    slides: {},
    elements: {},
    nextId: 1,
  };
}
```

In `createSampleDeck`, replace the `const empty: Deck = { … }` literal with:

```ts
  const empty: Deck = { ...createEmptyDeck(), id: "deck-sample", title: "Q3 Product Roadmap" };
```

- [ ] **Step 3: Store starts empty;** `replaceDeck` — in `src/lib/deck/store.ts`:

```ts
import { createEmptyDeck } from "./fixture";
```

(replacing the `createSampleDeck` import), add `replaceDeck: (deck: Deck) => void;` to `DeckState`, start with `deck: createEmptyDeck(),`, and add:

```ts
  replaceDeck(deck) {
    set({ deck, past: [], future: [] });
  },
```

- [ ] **Step 4: Actions** — append to `src/lib/slides/actions.ts`:

```ts
export function startNewDeck(): void {
  const { deck, applyOps } = useDeckStore.getState();
  if (deck.slideOrder.length === 0) return;
  applyOps(
    [...deck.slideOrder.map((id) => ({ op: "delete_slide" as const, id })), { op: "update_deck", patch: { title: "Untitled deck" } }],
    { source: "user", label: "New deck" },
  );
  requestAnimationFrame(() => document.getElementById("deck-prompt")?.focus());
}

export function loadSampleDeck(): void {
  useDeckStore.getState().replaceDeck(createSampleDeck());
  useUiStore.setState({ currentSlideId: null, selectedIds: [] });
}
```

with `import { createSampleDeck } from "@/lib/deck/fixture";` at the top.

- [ ] **Step 5: Check** — `npm run typecheck`. Reload http://localhost:3000: the stage 3 empty state ("This deck has no slides yet.") shows and the header says "Untitled deck". Click "Add blank slide": a slide appears; ⌘Z removes it. In the console, `deckStore.getState().applyOps([{ op: "update_deck", patch: { title: "Test" } }], { source: "user", label: "Rename deck" })` changes the header; ⌘Z restores "Untitled deck".

- [ ] **Step 6: Commit** — `git add src/lib/deck src/lib/slides && git commit -m "feat(deck): start on an empty deck; update_deck op, new deck and sample loader"`

---

### Task 2: Modes on the route, `plan_deck`, scoped tools, prompts

**Files:**

- Create: `src/lib/agent/tools/planTool.ts`
- Modify: `src/lib/agent/protocol.ts`, `src/lib/agent/tools/index.ts`, `src/lib/agent/tools/elementTools.ts`, `src/lib/agent/executeTool.ts`, `src/lib/server/prompts.ts`, `src/lib/server/sarvam.ts`, `src/lib/server/replay.ts`, `src/app/api/chat/route.ts`

**Interfaces:**

- Consumes: `defineTool`, `applyCreate`, `applyOne`, `done`, `fail` (`tools/shared.ts`); `titleElement` (`placement.ts`); `SlideLayoutSchema`.
- Produces:
  - `AGENT_MODES`, `type AgentMode = "plan" | "populate" | "edit"`; `ChatRequest.mode: AgentMode`
  - `PlanDeckArgs` (zod), `type PlannedSlide = { title: string; layout: Exclude<SlideLayout, "blank">; intent: string; visual: "chart" | "table" | "image" | "none" }`, `planDeck: AgentTool`, `addPlannedSlide(ctx, planned): string[] | string`, `type StreamedPlan = { slides: PlannedSlide[]; nextTitle: string | null }`, `parseStreamedPlan(partialArgs: string): StreamedPlan`
  - `toolsForMode(mode): AgentTool[]`, `findTool(name, mode = "edit")`
  - `type ToolScope = { txnId: string; label: string; mode?: AgentMode; slideId?: string }`; `executeToolCall(call, scope: ToolScope): ToolExecution`; `aiToolContext(txn: { txnId: string; label: string }): ToolContext`
  - `planSystemPrompt(): string`, `populateSystemPrompt(snapshot: string): string`
  - `fixtureName(mode: AgentMode, messages: ChatMessage[]): string`

- [ ] **Step 1: Probe Sarvam's** `tool_choice` (two tiny requests, about ₹0.05):

```bash
set -a; source .env.local; set +a
probe() {
  curl -sS https://api.sarvam.ai/v2/chat/completions \
    -H "content-type: application/json" -H "api-subscription-key: $SARVAM_API_KEY" \
    -d "{\"model\":\"sarvam-105b\",\"max_tokens\":600,\"reasoning_effort\":\"low\",
         \"messages\":[{\"role\":\"user\",\"content\":\"Plan a 3-slide deck about tea\"}],
         \"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"plan_deck\",\"description\":\"Outline a deck\",
           \"parameters\":{\"type\":\"object\",\"properties\":{\"title\":{\"type\":\"string\"},\"slides\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}},\"required\":[\"title\",\"slides\"]}}}],
         \"tool_choice\":$1}" | head -c 1200; echo
}
probe '{"type":"function","function":{"name":"plan_deck"}}'
probe '"required"'
```

Expected: each response has `choices[0].message.tool_calls[0].function.name == "plan_deck"`. Write down which forms work. If the named form returns 4xx, use `"required"` for `PLAN_TOOL_CHOICE` in Step 7; if `"required"` also fails, use `"auto"` for both plan and populate. Record the outcome in the Task 5 design doc update.

- [ ] **Step 2: Protocol** — in `src/lib/agent/protocol.ts`:

```ts
export const AGENT_MODES = ["plan", "populate", "edit"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];
```

and change the request schema's `mode` line to:

```ts
  mode: z.enum(AGENT_MODES),
```

- [ ] **Step 3:** `plan_deck` — `src/lib/agent/tools/planTool.ts`:

```ts
import { z } from "zod";
import { SlideLayoutSchema } from "@/lib/deck/schema";
import { titleElement } from "../placement";
import { applyCreate, applyOne, defineTool, done, fail, type ToolContext } from "./shared";

const PlannedSlideSchema = z.object({
  title: z.string().min(1).max(120).describe("At most 8 words"),
  layout: SlideLayoutSchema.exclude(["blank"]),
  intent: z.string().min(1).max(400).describe("What the slide says and, for charts and tables, what data it shows"),
  visual: z.enum(["chart", "table", "image", "none"]).describe("The main visual besides text"),
});

export const PlanDeckArgs = z.object({
  title: z.string().min(1).max(120),
  slides: z.array(PlannedSlideSchema).min(3).max(10),
});

export type PlannedSlide = z.infer<typeof PlannedSlideSchema>;

export const planDeck = defineTool({
  name: "plan_deck",
  description: "Outline the whole deck: its title and every slide in order. Each slide is filled in afterwards from its intent.",
  args: PlanDeckArgs,
  run({ title, slides }, ctx) {
    const renamed = applyOne(ctx, { op: "update_deck", patch: { title } });
    if (!renamed.ok) return fail(renamed.error);
    const touched: string[] = [];
    // Slides that streamed in earlier are already on the deck (generation starts empty).
    for (const planned of slides.slice(ctx.deck().slideOrder.length)) {
      const added = addPlannedSlide(ctx, planned);
      if (typeof added === "string") return fail(added);
      touched.push(...added);
    }
    return done(`Planned ${slides.length} slides for "${title}"`, touched);
  },
});

export function addPlannedSlide(ctx: ToolContext, planned: PlannedSlide): string[] | string {
  const slide = applyCreate(ctx, { op: "add_slide", slide: { title: planned.title, layout: planned.layout } });
  if ("error" in slide) return slide.error;
  const heading = applyCreate(ctx, { op: "add_element", slideId: slide.id, element: titleElement(planned.title, planned.layout) });
  return "id" in heading ? [slide.id, heading.id] : [slide.id];
}

export type StreamedPlan = { slides: PlannedSlide[]; nextTitle: string | null };

const TITLE_FIELD = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/;

export function parseStreamedPlan(partialArgs: string): StreamedPlan {
  const slides: PlannedSlide[] = [];
  const at = partialArgs.indexOf('"slides"');
  const open = at === -1 ? -1 : partialArgs.indexOf("[", at);
  if (open === -1) return { slides, nextTitle: null };
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = open + 1; i < partialArgs.length; i++) {
    const ch = partialArgs[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth++ === 0) start = i;
    } else if (ch === "}" && --depth === 0) {
      const slide = PlannedSlideSchema.safeParse(parseJson(partialArgs.slice(start, i + 1)));
      if (slide.success) slides.push(slide.data);
      start = -1;
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }
  const title = start === -1 ? undefined : TITLE_FIELD.exec(partialArgs.slice(start))?.[1];
  return { slides, nextTitle: title === undefined ? null : ((parseJson(`"${title}"`) as string | undefined) ?? null) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
```

`parseStreamedPlan` re-scans the whole argument string on every delta (a few KB at most). Slide objects are flat, so depth 1 marks a slide boundary. A slide object that fails validation is skipped; the final `PlanDeckArgs` check then fails too, and S5-e keeps the slides already added.

- [ ] **Step 4: Tools per mode** — in `src/lib/agent/tools/index.ts`, add imports `import type { AgentMode } from "../protocol";` and `import { planDeck } from "./planTool";`, then replace the `BY_NAME` map and `findTool` with:

```ts
const POPULATE_TOOL_NAMES = new Set(["add_element", "update_element", "add_chart", "update_chart_data", "add_table", "update_table"]);

const MODE_TOOLS: Record<AgentMode, AgentTool[]> = {
  edit: AGENT_TOOLS,
  plan: [planDeck],
  populate: AGENT_TOOLS.filter((tool) => POPULATE_TOOL_NAMES.has(tool.name)),
};

export const toolsForMode = (mode: AgentMode): AgentTool[] => MODE_TOOLS[mode];

export const findTool = (name: string, mode: AgentMode = "edit"): AgentTool | undefined =>
  MODE_TOOLS[mode].find((tool) => tool.name === name);
```

- [ ] **Step 5: Centered subtitles on hero slides** — in `src/lib/agent/tools/elementTools.ts`, `buildElement`, replace the `case "text"` body with:

```ts
    case "text": {
      if (!args.text) return "text is required when type is text";
      const { role, content, style } = args.text;
      const layout = deck.slides[args.slideId]?.layout;
      const centered = role !== "title" && (layout === "title" || layout === "section") ? { align: "center" as const } : {};
      const box = args.box ?? placeBox(deck, args.slideId, role === "title" ? "title" : "body");
      return { type: "text", box, text: { role, content, style: textStyle(role, { ...centered, ...style }) } };
    }
```

- [ ] **Step 6: Scoped execution** — in `src/lib/agent/executeTool.ts`:

```ts
import type { Deck } from "@/lib/deck/schema";
import type { AgentMode, ToolCall } from "./protocol";

export type ToolScope = { txnId: string; label: string; mode?: AgentMode; slideId?: string };
```

Change the signature to `executeToolCall(call: ToolCall, scope: ToolScope): ToolExecution`, the lookup to:

```ts
  const tool = findTool(call.function.name, scope.mode);
  if (!tool) return failed(base, `Tool ${call.function.name} is not available here`);
```

replace the inline `ctx` object with `const ctx = aiToolContext(scope);`, exporting:

```ts
export function aiToolContext(txn: { txnId: string; label: string }): ToolContext {
  return {
    deck: () => useDeckStore.getState().deck,
    apply: (ops: Op[]) => useDeckStore.getState().applyOps(ops, { source: "ai", label: txn.label, txnId: txn.txnId }),
  };
}
```

and right after the `JSON.parse` try/catch add:

```ts
  const outside = scope.slideId ? outsideSlide(useDeckStore.getState().deck, args, scope.slideId) : null;
  if (outside) return failed(base, outside);
```

with this helper at the bottom of the file:

```ts
function outsideSlide(deck: Deck, args: unknown, slideId: string): string | null {
  const { slideId: target, elementId } = (args ?? {}) as { slideId?: unknown; elementId?: unknown };
  if (typeof target === "string" && target !== slideId) return `Only slide ${slideId} can be changed now`;
  const element = typeof elementId === "string" ? deck.elements[elementId] : undefined;
  if (element && element.slideId !== slideId) return `Only elements on slide ${slideId} can be changed now`;
  return null;
}
```

- [ ] **Step 7: Prompts** — in `src/lib/server/prompts.ts`, add a rule to `editSystemPrompt` after the "If the request is ambiguous" line:

```
- If the user asks for a brand-new deck on another topic, don't rebuild this one: tell them to click "New deck" at the top and describe it there.
```

and add:

```ts
export function planSystemPrompt(): string {
  return `You plan slide decks. Call plan_deck exactly once with the deck title and every slide in order. Do not write slide content; each slide is filled in later from its intent.

Rules:
- Use the number of slides the user asks for; otherwise 5 to 7. If the user gives an outline, follow it.
- Slide 1 uses layout "title". Use "section" only to separate parts of decks longer than 8 slides. Use "chart-forward" for slides built around numbers, "comparison" for side-by-side options, "two-column" for text next to a picture or two lists, and "content" otherwise.
- visual: "chart" for numbers or trends, "table" for structured comparisons or specs, "image" when a photo helps, "none" for text only. Decks of 5 or more slides include at least one chart and one table unless the user says otherwise.
- intent: one or two sentences with the slide's key points, specific to the user's topic. For a chart, name the categories and series; for a table, name the columns and rows.
- Titles are short (at most 8 words) and specific.`;
}

export function populateSystemPrompt(snapshot: string): string {
  return `You fill one slide of a deck that has already been outlined. You change the deck only by calling tools, and only on the slide marked "<- the slide you fill".

Rules:
- The slide already has its title text box. Do not add another title or change it.
- Add the slide's content in one round of tool calls: usually one text element plus the planned visual, at most three elements. If the slide already has some content, add only what is missing.
- Never pass box; the editor lays the slide out.
- Bullets: 3 to 5 items of at most 12 words each. Body text: at most 2 sentences.
- By layout: title → one subtitle line (role "subtitle"), nothing else; section → one subtitle line; two-column → two bullet lists, or bullets plus an image; comparison → a table, or two bullet lists; chart-forward → the chart plus a short takeaway text; content → bullets plus the planned visual, if any.
- Charts: 3 to 8 categories, 1 to 3 series, exactly one number per category in each series. Use realistic numbers for the topic, a title, and axis labels.
- Tables: a header row plus 2 to 6 rows, 2 to 5 columns, short cells.
- Images: add_element with type "image", a 1-3 word photo keyword, and alt text describing the photo.
- Keep the tone and facts consistent with the rest of the outline, and do not repeat other slides' content.
- If a tool returns an error, fix the arguments and call it again. Do not reply with text.

Deck outline and the slide to fill:
${snapshot}`;
}
```

- [ ] **Step 8: Per-mode completion body** — replace the body of `src/lib/server/sarvam.ts` above `callSarvam` with:

```ts
import type { AgentMode, ChatRequest } from "@/lib/agent/protocol";
import { toOpenAiTools, toolsForMode, type OpenAiTool } from "@/lib/agent/tools";
import { editSystemPrompt, planSystemPrompt, populateSystemPrompt } from "./prompts";

const SARVAM_URL = "https://api.sarvam.ai/v2/chat/completions";
const REASONING_MODELS = new Set(["sarvam-105b", "glm5.3", "deepseekv4.1-flash"]);
const MAX_TOKENS = 3000;
const PLAN_TOOL_CHOICE = { type: "function", function: { name: "plan_deck" } };

type ModeConfig = { system: (snapshot: string) => string; tools: OpenAiTool[]; toolChoice: unknown };

const MODES: Record<AgentMode, ModeConfig> = {
  edit: { system: editSystemPrompt, tools: toOpenAiTools(toolsForMode("edit")), toolChoice: "auto" },
  plan: { system: planSystemPrompt, tools: toOpenAiTools(toolsForMode("plan")), toolChoice: PLAN_TOOL_CHOICE },
  populate: { system: populateSystemPrompt, tools: toOpenAiTools(toolsForMode("populate")), toolChoice: "required" },
};

export function buildCompletionBody(request: ChatRequest) {
  const model = process.env.SARVAM_MODEL || "sarvam-105b";
  const mode = MODES[request.mode];
  return {
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    tool_choice: mode.toolChoice,
    ...(REASONING_MODELS.has(model) && { reasoning_effort: "low" }),
    messages: [{ role: "system", content: mode.system(request.deckSnapshot) }, ...request.messages],
    tools: mode.tools,
  };
}
```

Apply the Step 1 fallback to `PLAN_TOOL_CHOICE` and the populate `toolChoice` if needed.

- [ ] **Step 9: Fixture names per mode** — in `src/lib/server/replay.ts`, change `fixtureName` to take the mode first:

```ts
export function fixtureName(mode: AgentMode, messages: ChatMessage[]): string {
```

and its return to:

```ts
  const prefix = mode === "edit" ? "" : `${mode}-`;
  return `${prefix}${slug}.step${step}.sse`;
```

with `import type { AgentMode, ChatMessage } from "@/lib/agent/protocol";`. In `src/app/api/chat/route.ts`: `const name = fixtureName(parsed.data.mode, parsed.data.messages);`.

- [ ] **Step 10: Check** — `npm run typecheck` (the `devtools.ts` call to `executeToolCall` still type-checks: `ToolScope`'s new fields are optional). With the dev server running:

```bash
curl -sN localhost:3000/api/chat -H 'content-type: application/json' \
  -d '{"mode":"plan","messages":[{"role":"user","content":"A 5-slide deck about urban beekeeping"}],"deckSnapshot":""}' | head -c 2000
```

Expected: SSE chunks whose `tool_calls` deltas name `plan_deck` and stream `"slides":[{"title":…` arguments over many chunks (not one blob at the end; S5-e depends on that). `{"mode":"populate",…}` with the same body returns a stream too (the content doesn't matter yet).

- [ ] **Step 11: Commit** — `git add src/lib src/app && git commit -m "feat(agent): plan and populate modes with plan_deck, scoped tools, and prompts"`

---

### Task 3: Client generation flow

**Files:**

- Create: `src/lib/agent/agentRequest.ts`, `src/lib/agent/arrange.ts`, `src/lib/generation/store.ts`, `src/lib/agent/populateSlide.ts`, `src/lib/agent/generateDeck.ts`, `src/lib/agent/sendPrompt.ts`
- Modify: `src/lib/agent/sse.ts`, `src/lib/agent/runAgent.ts`, `src/lib/agent/snapshot.ts`, `src/lib/agent/reveal.ts`, `src/lib/chat/store.ts`, `src/lib/agent/devtools.ts`, `src/lib/slides/actions.ts`

**Interfaces:**

- Consumes: Task 2's `executeToolCall(call, scope)`, `aiToolContext`, `PlanDeckArgs`, `PlannedSlide`, `addPlannedSlide`, `parseStreamedPlan`; existing `describeElement`, `clip`, `revealAiChanges`, chat store.
- Produces:
  - `type TurnEvents = { onText?: (delta: string) => void; onToolCall: (call: ToolCall) => void; onToolArgs?: (args: string, index: number) => void }`
  - `streamStep(request: ChatRequest, step: number, signal: AbortSignal, events: TurnEvents): Promise<{ text; toolCalls; usage; truncated }>`, `AgentRequestError`, `describeError(error: unknown): string`
  - `bodyElements(deck, slideId): Element[]`, `arrangeBoxes(layout, items: ArrangeItem[]): Record<string, Box>`, `arrangeSlide(deck, slideId): Op[]`, `type ArrangeItem = { id: string; visual: boolean }`
  - `serializeForPopulate(deck, slideId, outline: Record<string, { intent: string }>): string`
  - Generation store: `useGenerationStore` with `{ runId: number; phase: "idle" | "planning" | "populating" | "done"; nextTitle: string | null; outline: Record<string, PlannedSlide>; slides: Record<string, SlideFill> }`, `type FillStatus = "pending" | "filling" | "done" | "failed" | "stopped"`, `type SlideFill = { status: FillStatus; error?: string }`, `startGeneration(): number`, `setNextTitle(title)`, `addOutlineSlide(id, planned)`, `finishOutline()`, `setSlideFill(id, fill)`, `finishGeneration()`, `resetGeneration()`
  - `type TxnRef = { txnId: string; label: string }`, `populateSlide(slideId, txn, signal): Promise<void>` (never throws)
  - `generateDeck(prompt: string): Promise<void>`, `fillSlide(slideId: string): Promise<void>`
  - `sendPrompt(prompt: string): Promise<void>`
  - Chat item `{ id; kind: "generation"; runId: number }`, `pushNotice(tone, text, retryPrompt?)`
  - `revealAiChanges(ids, options?: { follow?: boolean })`

- [ ] **Step 1: SSE callbacks** — in `src/lib/agent/sse.ts`, export the events type and use it:

```ts
export type TurnEvents = {
  onText?: (delta: string) => void;
  onToolCall: (call: ToolCall) => void;
  onToolArgs?: (args: string, index: number) => void;
};

export function createTurnAccumulator(step: number, events: TurnEvents) {
```

In `push`, call `events.onText?.(delta.content);` and replace the arguments line with:

```ts
        if (part.function?.arguments) {
          call.function.arguments += part.function.arguments;
          events.onToolArgs?.(call.function.arguments, index);
        }
```

- [ ] **Step 2: Shared request helper** — create `src/lib/agent/agentRequest.ts`. Move the `AgentRequestError` class and `describeError` function out of `runAgent.ts` into it unchanged (both exported), and add:

```ts
import type { ChatErrorBody, ChatRequest } from "./protocol";
import { createTurnAccumulator, readSseEvents, type TurnEvents } from "./sse";

export async function streamStep(request: ChatRequest, step: number, signal: AbortSignal, events: TurnEvents) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as Partial<ChatErrorBody>;
    throw new AgentRequestError(res, body);
  }
  const accumulator = createTurnAccumulator(step, events);
  for await (const event of readSseEvents(res.body)) accumulator.push(event);
  const result = accumulator.finish();
  if (process.env.NODE_ENV !== "production" && result.usage) {
    console.debug(`[agent] ${request.mode} step ${step + 1} usage`, result.usage);
  }
  return result;
}
```

- [ ] **Step 3: Chat store** — in `src/lib/chat/store.ts`, add to the `ChatItem` union:

```ts
  | { id: string; kind: "generation"; runId: number }
```

and append:

```ts
export function pushNotice(tone: "info" | "error", text: string, retryPrompt?: string): void {
  useChatStore.getState().pushItem({ kind: "notice", tone, text, ...(retryPrompt && { retryPrompt }) });
}
```

- [ ] **Step 4:** `runAgent` **uses the helpers** — in `src/lib/agent/runAgent.ts`: delete `AgentRequestError`, `describeError`, and `notice`; replace every `notice(` call with `pushNotice(`; update imports to:

```ts
import { pushNotice, useChatStore, type TurnChanges } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { resolveCurrentSlideId, useUiStore } from "@/lib/ui/store";
import { describeError, streamStep } from "./agentRequest";
import { executeToolCall, type ToolExecution } from "./executeTool";
import { MAX_AGENT_STEPS, type ChatMessage, type ChatRequest, type ToolCall } from "./protocol";
import { revealAiChanges } from "./reveal";
import { clip, serializeForAI, type TurnMarks } from "./snapshot";
```

and replace `runStep` with:

```ts
async function runStep(step: number, messages: ChatMessage[], signal: AbortSignal, meta: TurnMeta): Promise<StepResult> {
  const { deck } = useDeckStore.getState();
  const currentSlideId = resolveCurrentSlideId(deck, useUiStore.getState().currentSlideId);
  const request: ChatRequest = {
    mode: "edit",
    messages,
    deckSnapshot:
      serializeForAI(deck, currentSlideId, meta.marks) + describeRecentChanges(useChatStore.getState().recentChanges),
  };

  const executions: ToolExecution[] = [];
  let repeats = 0;
  let assistantItemId: string | null = null;
  const { text, toolCalls, truncated } = await streamStep(request, step, signal, {
    onText(delta) {
      const chat = useChatStore.getState();
      assistantItemId ??= chat.pushItem({ kind: "assistant", text: "" });
      chat.appendText(assistantItemId, delta);
    },
    onToolCall(call) {
      const signature = callSignature(call);
      if (meta.applied.has(signature)) {
        repeats++;
        executions.push({
          callId: call.id,
          name: call.function.name,
          ok: true,
          summary: "",
          touched: [],
          added: [],
          previously: [],
          content: REPEAT_RESULT,
        });
        return;
      }
      const execution = executeToolCall(call, meta);
      executions.push(execution);
      if (execution.ok) {
        meta.applied.add(signature);
        const before = execution.previously.length > 0 ? ` (before: ${clip(execution.previously.join("; "), 400)})` : "";
        meta.changes.push(`${execution.summary}${before}`);
        for (const id of execution.touched) {
          meta.marks.set(id, execution.added.includes(id) || meta.marks.get(id) === "added" ? "added" : "edited");
        }
      }
      useChatStore.getState().pushItem({
        kind: "tool",
        ok: execution.ok,
        summary: execution.ok ? execution.summary : `${call.function.name} failed: ${execution.summary}`,
      });
      if (execution.ok) revealAiChanges(execution.touched);
    },
  });
  return { text, toolCalls, executions, truncated, onlyRepeats: toolCalls.length > 0 && repeats === toolCalls.length };
}
```

- [ ] **Step 5: Reveal without following** — in `src/lib/agent/reveal.ts`:

```ts
export function revealAiChanges(ids: string[], { follow = true }: { follow?: boolean } = {}): void {
```

and the last line becomes `if (follow && target && !busy) ui.goToSlide(target);`.

- [ ] **Step 6: Layout helper** — `src/lib/agent/arrange.ts`:

```ts
import type { Op } from "@/lib/deck/ops";
import type { Box, Deck, Element, SlideLayout } from "@/lib/deck/schema";

const GAP = 40;
const BODY: Box = { x: 80, y: 220, w: 1440, h: 620 };
const HERO_BODY: Box = { x: 160, y: 480, w: 1280, h: 320 };

export type ArrangeItem = { id: string; visual: boolean };

export function bodyElements(deck: Deck, slideId: string): Element[] {
  return (deck.slides[slideId]?.elementOrder ?? []).flatMap((id) => {
    const element = deck.elements[id];
    return element && !(element.type === "text" && element.text.role === "title") ? [element] : [];
  });
}

export function arrangeSlide(deck: Deck, slideId: string): Op[] {
  const layout = deck.slides[slideId]?.layout;
  if (!layout) return [];
  const elements = bodyElements(deck, slideId);
  const boxes = arrangeBoxes(layout, elements.map((element) => ({ id: element.id, visual: element.type !== "text" })));
  return elements.flatMap((element) => {
    const box = boxes[element.id];
    return box && !sameBox(box, element.box) ? [{ op: "update_element" as const, id: element.id, patch: { box } }] : [];
  });
}

export function arrangeBoxes(layout: SlideLayout, items: ArrangeItem[]): Record<string, Box> {
  if (items.length === 0) return {};
  if (layout === "title" || layout === "section") return assign(items, rows(HERO_BODY, items.length));
  const texts = items.filter((item) => !item.visual);
  const visuals = items.filter((item) => item.visual);
  if (layout === "chart-forward" && visuals.length === 1 && texts.length === 1) {
    return assign([...visuals, ...texts], columns(BODY, [2, 1]));
  }
  const ordered = [...texts, ...visuals];
  if (ordered.length <= 3) return assign(ordered, columns(BODY, ones(ordered.length)));
  const [top, bottom] = rows(BODY, 2) as [Box, Box];
  const perRow = Math.ceil(ordered.length / 2);
  return assign(ordered, [...columns(top, ones(perRow)), ...columns(bottom, ones(ordered.length - perRow))]);
}

function columns(area: Box, weights: number[]): Box[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const free = area.w - GAP * (weights.length - 1);
  let x = area.x;
  return weights.map((weight) => {
    const w = Math.round((free * weight) / total);
    const box = { x, y: area.y, w, h: area.h };
    x += w + GAP;
    return box;
  });
}

function rows(area: Box, count: number): Box[] {
  const h = Math.round((area.h - GAP * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => ({ x: area.x, y: area.y + i * (h + GAP), w: area.w, h }));
}

function assign(items: ArrangeItem[], boxes: Box[]): Record<string, Box> {
  return Object.fromEntries(items.map((item, i) => [item.id, boxes[i]!]));
}

const ones = (count: number): number[] => Array<number>(count).fill(1);

const sameBox = (a: Box, b: Box): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
```

- [ ] **Step 7: Populate snapshot** — append to `src/lib/agent/snapshot.ts`:

```ts
export function serializeForPopulate(deck: Deck, slideId: string, outline: Record<string, { intent: string }>): string {
  const lines = [`Deck "${deck.title}", ${deck.slideOrder.length} slides, artboard 1600x900`];
  deck.slideOrder.forEach((id, index) => {
    const slide = deck.slides[id];
    if (!slide) return;
    const intent = outline[id] ? ` - ${clip(outline[id].intent, 200)}` : "";
    const target = id === slideId ? "  <- the slide you fill" : "";
    lines.push(`[${index + 1}] ${id} ${JSON.stringify(slide.title)} layout=${slide.layout}${intent}${target}`);
  });
  lines.push("", `Slide ${slideId} contains (back to front):`);
  for (const id of deck.slides[slideId]?.elementOrder ?? []) {
    const element = deck.elements[id];
    if (element) lines.push(`  ${describeElement(element)}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 8: Generation store** — `src/lib/generation/store.ts`:

```ts
import { create } from "zustand";
import type { PlannedSlide } from "@/lib/agent/tools/planTool";

export type FillStatus = "pending" | "filling" | "done" | "failed" | "stopped";
export type SlideFill = { status: FillStatus; error?: string };

type GenerationState = {
  runId: number;
  phase: "idle" | "planning" | "populating" | "done";
  nextTitle: string | null;
  outline: Record<string, PlannedSlide>;
  slides: Record<string, SlideFill>;
};

const IDLE: Omit<GenerationState, "runId"> = { phase: "idle", nextTitle: null, outline: {}, slides: {} };

export const useGenerationStore = create<GenerationState>()(() => ({ runId: 0, ...IDLE }));

const set = useGenerationStore.setState;

export function startGeneration(): number {
  const runId = useGenerationStore.getState().runId + 1;
  set({ ...IDLE, runId, phase: "planning" });
  return runId;
}

export function setNextTitle(title: string | null): void {
  if (useGenerationStore.getState().nextTitle !== title) set({ nextTitle: title });
}

export function addOutlineSlide(id: string, planned: PlannedSlide): void {
  set((s) => ({ outline: { ...s.outline, [id]: planned }, slides: { ...s.slides, [id]: { status: "pending" } } }));
}

export function finishOutline(): void {
  set({ phase: "populating", nextTitle: null });
}

export function setSlideFill(id: string, fill: SlideFill): void {
  set((s) => ({ slides: { ...s.slides, [id]: fill } }));
}

export function finishGeneration(): void {
  set((s) => ({
    phase: "done",
    slides: Object.fromEntries(
      Object.entries(s.slides).map(([id, fill]) => [
        id,
        fill.status === "pending" || fill.status === "filling" ? { status: "stopped" as const } : fill,
      ]),
    ),
  }));
}

export function resetGeneration(): void {
  set(IDLE);
}
```

- [ ] **Step 9: One slide's populate loop** — `src/lib/agent/populateSlide.ts`:

```ts
import { useDeckStore } from "@/lib/deck/store";
import { setSlideFill, useGenerationStore } from "@/lib/generation/store";
import { describeError, streamStep } from "./agentRequest";
import { arrangeSlide, bodyElements } from "./arrange";
import { executeToolCall, type ToolExecution } from "./executeTool";
import type { ChatMessage } from "./protocol";
import { revealAiChanges } from "./reveal";
import { serializeForPopulate } from "./snapshot";
import type { PlannedSlide } from "./tools/planTool";

const POPULATE_MAX_STEPS = 3;

export type TxnRef = { txnId: string; label: string };

export async function populateSlide(slideId: string, txn: TxnRef, signal: AbortSignal): Promise<void> {
  const planned = useGenerationStore.getState().outline[slideId];
  if (!planned) return;
  setSlideFill(slideId, { status: "filling" });
  const turn: ChatMessage[] = [{ role: "user", content: instruction(slideId, planned) }];
  let lastError = "";

  try {
    for (let step = 0; step < POPULATE_MAX_STEPS; step++) {
      const { deck } = useDeckStore.getState();
      if (!deck.slides[slideId]) break;
      const executions: ToolExecution[] = [];
      const snapshot = serializeForPopulate(deck, slideId, useGenerationStore.getState().outline);
      const result = await streamStep({ mode: "populate", messages: turn, deckSnapshot: snapshot }, step, signal, {
        onToolCall(call) {
          const execution = executeToolCall(call, { ...txn, mode: "populate", slideId });
          executions.push(execution);
          if (!execution.ok) {
            lastError = execution.summary;
            return;
          }
          tidy(slideId, txn);
          revealAiChanges(execution.touched, { follow: false });
        },
      });
      turn.push({
        role: "assistant",
        content: result.text || null,
        ...(result.toolCalls.length > 0 && { tool_calls: result.toolCalls }),
      });
      for (const execution of executions) turn.push({ role: "tool", tool_call_id: execution.callId, content: execution.content });
      if (executions.length === 0) {
        if (result.truncated) lastError = "The AI ran out of room while thinking";
        break;
      }
      if (executions.every((execution) => execution.ok)) break;
    }
    const filled = bodyElements(useDeckStore.getState().deck, slideId).length > 0;
    setSlideFill(slideId, filled ? { status: "done" } : { status: "failed", error: lastError || "The AI added no content" });
  } catch (error) {
    setSlideFill(slideId, signal.aborted ? { status: "stopped" } : { status: "failed", error: describeError(error) });
  }
}

function instruction(slideId: string, planned: PlannedSlide): string {
  const number = useDeckStore.getState().deck.slideOrder.indexOf(slideId) + 1;
  return `Fill slide ${number} (${slideId}) "${planned.title}". Layout: ${planned.layout}. Planned visual: ${planned.visual}. It should cover: ${planned.intent}`;
}

function tidy(slideId: string, txn: TxnRef): void {
  const { deck, applyOps } = useDeckStore.getState();
  const ops = arrangeSlide(deck, slideId);
  if (ops.length > 0) applyOps(ops, { source: "ai", ...txn });
}
```

- [ ] **Step 10: Plan, pool, retry** — `src/lib/agent/generateDeck.ts`:

```ts
import { pushNotice, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import {
  addOutlineSlide,
  finishGeneration,
  finishOutline,
  setNextTitle,
  startGeneration,
  useGenerationStore,
} from "@/lib/generation/store";
import { useUiStore } from "@/lib/ui/store";
import { describeError, streamStep } from "./agentRequest";
import { aiToolContext, executeToolCall } from "./executeTool";
import { populateSlide, type TxnRef } from "./populateSlide";
import { clip } from "./snapshot";
import { addPlannedSlide, PlanDeckArgs, parseStreamedPlan, type PlannedSlide } from "./tools/planTool";

const POPULATE_CONCURRENCY = 2;
const MAX_PLANNED_SLIDES = 10;

type OnPlannedSlide = (slideId: string, planned: PlannedSlide, index: number) => void;

export async function generateDeck(prompt: string): Promise<void> {
  const text = prompt.trim();
  const chat = useChatStore.getState();
  if (!text || chat.abort) return;

  const abort = new AbortController();
  chat.beginTurn(abort);
  chat.pushItem({ kind: "user", text });
  chat.pushItem({ kind: "generation", runId: startGeneration() });
  const txn: TxnRef = { txnId: crypto.randomUUID(), label: `AI: ${clip(text, 40)}` };
  const fills: Promise<void>[] = [];
  const startedEarly = new Set<string>();
  let reply = "";

  const onPlannedSlide: OnPlannedSlide = (slideId, planned, index) => {
    if (index !== 0) return;
    useUiStore.getState().goToSlide(slideId);
    if (planned.layout !== "title") return;
    startedEarly.add(slideId);
    fills.push(populateSlide(slideId, txn, abort.signal));
  };

  try {
    const slideIds = await planOutline(text, txn, abort.signal, onPlannedSlide);
    finishOutline();
    const rest = slideIds.filter((id) => !startedEarly.has(id));
    fills.push(runPool(rest, abort.signal, (slideId) => populateSlide(slideId, txn, abort.signal)));
    await Promise.all(fills);
    if (abort.signal.aborted) {
      pushNotice("info", "Stopped. The slides made so far are kept; use Fill with AI on the rest, or ⌘Z to remove the deck.");
    } else {
      reply = describeOutcome();
      useChatStore.getState().pushItem({ kind: "assistant", text: reply });
    }
  } catch (error) {
    await Promise.all(fills);
    const kept = useDeckStore.getState().deck.slideOrder.length;
    if (!abort.signal.aborted) pushNotice("error", describeError(error), text);
    else if (kept === 0) pushNotice("info", "Stopped before the outline was ready. Nothing was changed.");
    else pushNotice("info", `Stopped while outlining. The ${kept} slides so far are kept; use Fill with AI on them, or ⌘Z to remove them.`);
  } finally {
    finishGeneration();
    useChatStore.getState().endTurn(
      [
        { role: "user", content: text },
        { role: "assistant", content: reply || "(no reply)" },
      ],
      { prompt: text, changes: [] },
    );
  }
}

export async function fillSlide(slideId: string): Promise<void> {
  const chat = useChatStore.getState();
  const title = useDeckStore.getState().deck.slides[slideId]?.title;
  if (chat.abort || !title || !useGenerationStore.getState().outline[slideId]) return;
  const abort = new AbortController();
  chat.beginTurn(abort);
  try {
    await populateSlide(slideId, { txnId: crypto.randomUUID(), label: `AI: Fill "${clip(title, 30)}"` }, abort.signal);
  } finally {
    useChatStore.getState().endTurn([], { prompt: "", changes: [] });
  }
}

async function planOutline(prompt: string, txn: TxnRef, signal: AbortSignal, onSlide: OnPlannedSlide): Promise<string[]> {
  const ctx = aiToolContext(txn);
  const slideIds: string[] = [];
  let finalCall = false;
  let renamed = false;
  let planError = "";

  const register = (slideId: string, planned: PlannedSlide) => {
    slideIds.push(slideId);
    addOutlineSlide(slideId, planned);
    onSlide(slideId, planned, slideIds.length - 1);
  };

  let truncated = false;
  try {
    const result = await streamStep(
      { mode: "plan", messages: [{ role: "user", content: prompt }], deckSnapshot: "" },
      0,
      signal,
      {
        onToolArgs(args, index) {
          if (index !== 0) return;
          const streamed = parseStreamedPlan(args);
          for (const planned of streamed.slides.slice(slideIds.length, MAX_PLANNED_SLIDES)) {
            const added = addPlannedSlide(ctx, planned);
            if (typeof added === "string") {
              planError = added;
              break;
            }
            register(added[0]!, planned);
          }
          setNextTitle(streamed.nextTitle);
        },
        onToolCall(call) {
          if (finalCall || call.function.name !== "plan_deck") return;
          finalCall = true;
          const execution = executeToolCall(call, { ...txn, mode: "plan" });
          if (!execution.ok) {
            planError = execution.summary;
            return;
          }
          renamed = true;
          const { slides } = PlanDeckArgs.parse(JSON.parse(call.function.arguments));
          const known = slideIds.length;
          for (const [i, id] of useDeckStore.getState().deck.slideOrder.slice(known).entries()) register(id, slides[known + i]!);
        },
      },
    );
    truncated = result.truncated;
  } catch (error) {
    if (signal.aborted || slideIds.length === 0) throw error;
    pushNotice("error", `The outline broke off after ${slideIds.length} slides (${describeError(error)}). Filling those.`);
  } finally {
    setNextTitle(null);
    const first = slideIds[0] && useDeckStore.getState().deck.slides[slideIds[0]];
    if (!renamed && first) ctx.apply([{ op: "update_deck", patch: { title: first.title } }]);
  }

  if (slideIds.length === 0) {
    if (planError) throw new Error(`The outline was invalid: ${clip(planError, 300)}`);
    throw new Error(truncated ? "The AI ran out of room while planning. Try a shorter request." : "The AI didn't return an outline. Try again.");
  }
  return slideIds;
}

async function runPool(ids: string[], signal: AbortSignal, run: (id: string) => Promise<void>): Promise<void> {
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined && !signal.aborted; id = queue.shift()) await run(id);
  };
  await Promise.all(Array.from({ length: Math.min(POPULATE_CONCURRENCY, ids.length) }, worker));
}

function describeOutcome(): string {
  const { deck } = useDeckStore.getState();
  const failed = Object.values(useGenerationStore.getState().slides).filter((fill) => fill.status === "failed").length;
  const base = `Created "${deck.title}" with ${deck.slideOrder.length} slides.`;
  if (failed === 0) return `${base} Ask me to change anything, or edit the slides directly.`;
  return `${base} ${failed} couldn't be filled; use Retry on ${failed === 1 ? "that slide" : "those slides"}.`;
}
```

- [ ] **Step 11: Routing** — `src/lib/agent/sendPrompt.ts`:

```ts
import { useDeckStore } from "@/lib/deck/store";
import { generateDeck } from "./generateDeck";
import { runAgent } from "./runAgent";

export function sendPrompt(prompt: string): Promise<void> {
  return useDeckStore.getState().deck.slideOrder.length === 0 ? generateDeck(prompt) : runAgent(prompt);
}
```

- [ ] **Step 12: Reset generation state on deck swaps** — in `src/lib/slides/actions.ts`, `import { resetGeneration } from "@/lib/generation/store";` and call `resetGeneration();` in both `startNewDeck` (after `applyOps`) and `loadSampleDeck`.

- [ ] **Step 13: Devtools** — in `src/lib/agent/devtools.ts`, import `fillSlide, generateDeck` from `./generateDeck` and extend the object:

```ts
const agentDevtools = {
  snapshot,
  run,
  ask: runAgent,
  generate: generateDeck,
  fill: fillSlide,
  stop: stopAgent,
  definitions: () => toOpenAiTools(),
};
```

- [ ] **Step 14: Check** (spends about ₹1) — `npm run typecheck`. Reload (empty deck) and in the console run `agent.generate("A 5-slide deck about urban beekeeping with a honey yield chart and a hive comparison table")`. Watch the filmstrip: slides appear one at a time while the plan streams (not all at once at the end), the title slide gets its subtitle before the last slide has arrived, then the other slides fill two at a time with green pulses, laid out without overlaps (the skeleton UI comes in Task 4). Afterwards `deckStore.getState().past.length` is `1` (one undo step); ⌘Z empties the deck. Then send `agent.ask("Add a closing slide")` on a generated deck: edit mode still works as in stage 4.

- [ ] **Step 15: Commit** — `git add src/lib && git commit -m "feat(agent): two-phase generation with streamed outline, per-slide populate, and layout"`

---

### Task 4: Empty, loading, progress, and error UI

**Files:**

- Create: `src/components/generation/EmptyDeck.tsx`, `src/components/generation/PlanningState.tsx`, `src/components/generation/GenerationProgress.tsx`, `src/components/canvas/SlideFillOverlay.tsx`, `src/components/filmstrip/FillBadge.tsx`
- Modify: `src/components/shell/EditorShell.tsx`, `src/components/canvas/CanvasStage.tsx`, `src/components/filmstrip/Filmstrip.tsx`, `src/components/filmstrip/SlideThumbnail.tsx`, `src/components/chat/ChatComposer.tsx`, `src/components/chat/ChatTranscript.tsx`, `src/app/globals.css`

**Interfaces:**

- Consumes: everything Task 3 produces; `addBlankSlide`, `startNewDeck`, `loadSampleDeck`; `THUMBNAIL_WIDTH`.
- Produces: UI only.

- [ ] **Step 1: Shimmer** — append to `src/app/globals.css`:

```css
.gen-shimmer {
  background-color: rgb(244 244 245);
  background-image: linear-gradient(100deg, transparent 30%, rgb(255 255 255 / 0.85) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: gen-shimmer 1.4s linear infinite;
}

@keyframes gen-shimmer {
  from {
    background-position: 150% 0;
  }
  to {
    background-position: -50% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gen-shimmer {
    animation: none;
  }
}
```

- [ ] **Step 2: Empty deck prompt** — `src/components/generation/EmptyDeck.tsx`:

```tsx
"use client";

import { useState } from "react";
import { generateDeck } from "@/lib/agent/generateDeck";
import { MAX_PROMPT_CHARS } from "@/lib/agent/protocol";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { addBlankSlide, loadSampleDeck } from "@/lib/slides/actions";

const EXAMPLES = [
  "A 6-slide deck on our Q3 product roadmap, with a revenue chart and a feature comparison table",
  "A 5-slide pitch for a neighborhood coffee subscription",
  "Explain how solar panels work to high school students in 5 slides",
];

export function EmptyDeck() {
  const [prompt, setPrompt] = useState("");
  const running = useChatStore(selectRunning);

  function submit() {
    if (running || !prompt.trim()) return;
    void generateDeck(prompt);
    setPrompt("");
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <form
        className="flex w-full max-w-xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h1 className="text-lg font-semibold text-zinc-800">Create a presentation</h1>
        <p className="text-sm text-zinc-500">
          Describe the deck you want. The AI outlines the slides, then fills each one. Everything stays editable.
        </p>
        <textarea
          id="deck-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          rows={4}
          maxLength={MAX_PROMPT_CHARS}
          placeholder="e.g. A 5-slide deck on our hiring plan for 2027, with a headcount chart"
          className="resize-none rounded border border-chrome-border bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-chrome-border bg-white px-3 py-1 text-left text-xs text-zinc-600 hover:border-accent hover:text-accent"
            >
              {example}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            Or{" "}
            <button type="button" onClick={() => addBlankSlide("end")} className="underline hover:text-zinc-600">
              start with a blank slide
            </button>{" "}
            ·{" "}
            <button type="button" onClick={loadSampleDeck} className="underline hover:text-zinc-600">
              load the sample deck
            </button>
          </p>
          <button
            type="submit"
            disabled={running || !prompt.trim()}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Generate deck
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Planning canvas** — `src/components/generation/PlanningState.tsx`:

```tsx
"use client";

import { useGenerationStore } from "@/lib/generation/store";

export function PlanningState() {
  const title = useGenerationStore((s) => s.nextTitle);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <p className="animate-pulse text-sm font-medium text-zinc-600">Planning your deck…</p>
      {title && <p className="text-sm text-zinc-500">{title}</p>}
    </div>
  );
}
```

This shows only until the first slide is added (usually 1–2 s); after that the canvas is on slide 1.

- [ ] **Step 4: Canvas overlay** — `src/components/canvas/SlideFillOverlay.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { arrangeBoxes, bodyElements, type ArrangeItem } from "@/lib/agent/arrange";
import { fillSlide } from "@/lib/agent/generateDeck";
import { clip } from "@/lib/agent/snapshot";
import type { PlannedSlide } from "@/lib/agent/tools/planTool";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import type { Box } from "@/lib/deck/schema";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore } from "@/lib/generation/store";

const OVERLAY_Z = 9998;
const TEXT_BARS = [100, 92, 84, 58];

export function SlideFillOverlay({ slideId }: { slideId: string }) {
  const fill = useGenerationStore((s) => s.slides[slideId]);
  const planned = useGenerationStore((s) => s.outline[slideId]);
  const empty = useDeckStore((s) => bodyElements(s.deck, slideId).length === 0);
  const running = useChatStore(selectRunning);
  if (!fill || !planned || fill.status === "done") return null;

  if (fill.status === "pending" || fill.status === "filling") {
    if (empty) return <Skeleton planned={planned} caption={fill.status === "filling" ? "Writing this slide…" : "Queued"} />;
    return (
      <Layer>
        <span
          className="absolute top-6 right-6 animate-pulse rounded-full bg-accent/10 px-4 py-1.5 font-medium text-accent"
          style={{ fontSize: 22 }}
        >
          Writing…
        </span>
      </Layer>
    );
  }

  const failed = fill.status === "failed";
  return (
    <Layer>
      <div
        className="pointer-events-auto absolute bottom-8 left-1/2 flex w-[960px] -translate-x-1/2 items-center gap-6 rounded-xl bg-white px-8 py-5 shadow-lg ring-1 ring-black/10"
        style={{ fontSize: 24 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-800">{failed ? "Couldn't fill this slide" : "This slide wasn't filled"}</p>
          {failed && fill.error && <p className="truncate text-zinc-500">{clip(fill.error, 140)}</p>}
        </div>
        <button
          type="button"
          disabled={running}
          onClick={() => void fillSlide(slideId)}
          className="rounded-lg bg-accent px-6 py-3 font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {failed ? "Retry" : "Fill with AI"}
        </button>
      </div>
    </Layer>
  );
}

function Layer({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: OVERLAY_Z }}>
      {children}
    </div>
  );
}

function Skeleton({ planned, caption }: { planned: PlannedSlide; caption: string }) {
  const items = skeletonItems(planned);
  const boxes = arrangeBoxes(planned.layout, items);
  return (
    <Layer>
      {items.map((item) => {
        const box = boxes[item.id];
        if (!box) return null;
        return item.visual ? (
          <div key={item.id} className="gen-shimmer absolute rounded-2xl" style={position(box)} />
        ) : (
          <div key={item.id} className="absolute flex flex-col gap-7" style={{ left: box.x, top: box.y + 16, width: box.w }}>
            {TEXT_BARS.map((width) => (
              <div key={width} className="gen-shimmer h-8 rounded-lg" style={{ width: `${width}%` }} />
            ))}
          </div>
        );
      })}
      <p className="absolute inset-x-0 bottom-8 text-center text-zinc-400" style={{ fontSize: 24 }}>
        {caption}
      </p>
    </Layer>
  );
}

function skeletonItems(planned: PlannedSlide): ArrangeItem[] {
  const text = { id: "text", visual: false };
  if (planned.layout === "title" || planned.layout === "section" || planned.visual === "none") return [text];
  return [text, { id: "visual", visual: true }];
}

const position = (box: Box) => ({ left: box.x, top: box.y, width: box.w, height: box.h });
```

- [ ] **Step 5: Thumbnail badge** — `src/components/filmstrip/FillBadge.tsx`:

```tsx
"use client";

import { bodyElements } from "@/lib/agent/arrange";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore } from "@/lib/generation/store";

export function FillBadge({ slideId }: { slideId: string }) {
  const status = useGenerationStore((s) => s.slides[slideId]?.status);
  const empty = useDeckStore((s) => bodyElements(s.deck, slideId).length === 0);

  if (status === "pending" || status === "filling") {
    return empty ? <span aria-hidden className="gen-shimmer pointer-events-none absolute inset-x-[6%] top-[26%] bottom-[8%] rounded-sm" /> : null;
  }
  if (status === "failed") return <span title="Couldn't fill this slide" className="absolute top-1 right-1 size-2 rounded-full bg-amber-500" />;
  if (status === "stopped") return <span title="Not filled yet" className="absolute top-1 right-1 size-2 rounded-full bg-zinc-400" />;
  return null;
}
```

In `src/components/filmstrip/SlideThumbnail.tsx`, import it and render `<FillBadge slideId={slideId} />` right after `<ThumbnailArt slideId={slideId} />`.

- [ ] **Step 6: Filmstrip placeholder while planning** — in `src/components/filmstrip/Filmstrip.tsx`, add imports `import { useGenerationStore } from "@/lib/generation/store";` and `import { THUMBNAIL_WIDTH } from "./constants";`, read `const planning = useGenerationStore((s) => s.phase === "planning");`, render `{planning && <OutlineGhost number={slideOrder.length + 1} />}` after the last thumbnail, just above the "+ Add slide" button, and add:

```tsx
function OutlineGhost({ number }: { number: number }) {
  const title = useGenerationStore((s) => s.nextTitle);
  return (
    <div className="flex items-start gap-2" aria-label="Outlining the next slide">
      <span className="w-4 pt-1 text-right text-xs text-zinc-300 tabular-nums">{number}</span>
      <div className="flex min-w-0 flex-col gap-1" style={{ width: THUMBNAIL_WIDTH }}>
        <div className="gen-shimmer aspect-video rounded-sm" />
        <span className="truncate text-xs text-zinc-500">{title ?? ""}</span>
      </div>
    </div>
  );
}
```

Real slides appear above it one by one as the plan streams, and the ghost goes away when the outline is complete.

- [ ] **Step 7: Chat progress item** — `src/components/generation/GenerationProgress.tsx`:

```tsx
"use client";

import { fillSlide } from "@/lib/agent/generateDeck";
import { selectRunning, useChatStore } from "@/lib/chat/store";
import { useDeckStore } from "@/lib/deck/store";
import { useGenerationStore, type FillStatus } from "@/lib/generation/store";

const STATUS: Record<FillStatus, { glyph: string; className: string; label: string }> = {
  pending: { glyph: "○", className: "text-zinc-300", label: "Queued" },
  filling: { glyph: "●", className: "animate-pulse text-accent", label: "Writing…" },
  done: { glyph: "✓", className: "text-emerald-600", label: "" },
  failed: { glyph: "✗", className: "text-amber-600", label: "Failed" },
  stopped: { glyph: "–", className: "text-zinc-400", label: "Not filled" },
};

export function GenerationProgress({ runId }: { runId: number }) {
  const current = useGenerationStore((s) => s.runId === runId);
  const phase = useGenerationStore((s) => s.phase);
  const nextTitle = useGenerationStore((s) => s.nextTitle);
  const fills = useGenerationStore((s) => s.slides);
  const slideOrder = useDeckStore((s) => s.deck.slideOrder);
  const slides = useDeckStore((s) => s.deck.slides);
  const running = useChatStore(selectRunning);

  if (!current) return <p className="text-xs text-zinc-400">Generated an earlier deck.</p>;

  const ids = slideOrder.filter((id) => fills[id]);
  const planning = phase === "planning";
  if (ids.length === 0 && !planning) return null;
  const done = ids.filter((id) => fills[id]?.status === "done").length;
  const heading = planning
    ? `Planning the outline · ${ids.length} ${ids.length === 1 ? "slide" : "slides"} so far`
    : phase === "populating"
      ? `Filling slides · ${done} of ${ids.length}`
      : `${done} of ${ids.length} slides filled`;

  return (
    <div className="flex flex-col gap-1 rounded border border-chrome-border px-3 py-2 text-xs">
      <p className={`font-medium text-zinc-700 ${planning ? "animate-pulse" : ""}`}>{heading}</p>
      <ol className="flex flex-col gap-0.5">
        {ids.map((id) => {
          const fill = fills[id]!;
          const status = STATUS[fill.status];
          const action = fill.status === "failed" ? "Retry" : fill.status === "stopped" ? "Fill" : null;
          return (
            <li key={id} className="flex items-baseline gap-2">
              <span className={`w-3 shrink-0 ${status.className}`}>{status.glyph}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-700" title={fill.error}>
                {slideOrder.indexOf(id) + 1}. {slides[id]?.title}
              </span>
              {status.label && <span className="text-zinc-400">{status.label}</span>}
              {action && (
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void fillSlide(id)}
                  className="font-medium text-accent underline disabled:opacity-40"
                >
                  {action}
                </button>
              )}
            </li>
          );
        })}
        {planning && (
          <li className="flex items-baseline gap-2 text-zinc-400">
            <span className="w-3 shrink-0 animate-pulse">○</span>
            <span className="min-w-0 flex-1 truncate">
              {ids.length + 1}. {nextTitle ?? "…"}
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
```

- [ ] **Step 8: Chat wiring** — in `src/components/chat/ChatTranscript.tsx`:
  - Replace the `runAgent` import with `import { sendPrompt } from "@/lib/agent/sendPrompt";`, add `import { GenerationProgress } from "@/components/generation/GenerationProgress";` and `import { useDeckStore } from "@/lib/deck/store";`.
  - The Retry button calls `void sendPrompt(retry)`.
  - Add `case "generation": return <GenerationProgress runId={item.runId} />;` to `ChatRow`.
  - The "Thinking…" condition becomes `running && items.at(-1)?.kind !== "assistant" && items.at(-1)?.kind !== "generation"`.
  - In `EmptyChat`, read `const emptyDeck = useDeckStore((s) => s.deck.slideOrder.length === 0);` and when it is true render only:

```tsx
    <div className="flex flex-1 flex-col justify-center gap-3 p-6 text-sm text-zinc-500">
      <p>Describe the presentation you want, here or in the box on the canvas. The AI outlines the slides, then fills each one.</p>
    </div>
```

  In `src/components/chat/ChatComposer.tsx`: call `void sendPrompt(draft)` instead of `runAgent`, keep `stopAgent` from `runAgent`, read `const emptyDeck = useDeckStore((s) => s.deck.slideOrder.length === 0);`, and set `placeholder={emptyDeck ? "Describe the presentation you want…" : "Ask the AI to change the deck…"}`.

- [ ] **Step 9: Canvas and header** — in `src/components/canvas/CanvasStage.tsx`, import and render `<SlideFillOverlay slideId={slideId} />` after `<AiHighlightOverlay slideId={slideId} />`. In `src/components/shell/EditorShell.tsx`:

```tsx
function CanvasArea() {
  const slideId = useCurrentSlideId();
  const planning = useGenerationStore((s) => s.phase === "planning");
  if (!slideId) return planning ? <PlanningState /> : <EmptyDeck />;
  return <CanvasStage slideId={slideId} />;
}

function NewDeckButton() {
  const empty = useDeckStore((s) => s.deck.slideOrder.length === 0);
  const running = useChatStore(selectRunning);
  return (
    <button
      type="button"
      onClick={startNewDeck}
      disabled={empty || running}
      title="Clear the deck and describe a new one (⌘Z brings this one back)"
      className="rounded border border-chrome-border px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
    >
      New deck
    </button>
  );
}
```

The header's left side becomes `<div className="flex min-w-0 items-center gap-3"><span className="truncate text-sm font-semibold">{deckTitle}</span><NewDeckButton /></div>`. Update imports (`EmptyDeck`, `PlanningState`, `useGenerationStore`, `selectRunning`, `useChatStore`, `startNewDeck`; drop `addBlankSlide`, now used in `EmptyDeck`).

- [ ] **Step 10: Check** (spends about ₹1) — `npm run typecheck && npm run lint`. Reload: the prompt box shows. Click the first example chip, press Generate deck: the canvas shows "Planning your deck…" briefly, then slide 1 appears and the canvas moves to it. Further slides are added to the filmstrip one by one, each with a layout skeleton, while a shimmering ghost at the end shows the title being outlined. The title slide's subtitle lands while later slides are still arriving. Once the ghost disappears, the other slides fill, the chat shows "Filling slides · n of 6" counting up, and a closing sentence. Click "New deck": the prompt box returns; ⌘Z brings the deck back.

- [ ] **Step 11: Commit** — `git add src && git commit -m "feat(generation): prompt empty state, streamed outline, slide skeletons, progress, and retry"`

---

### Task 5: Record fixtures, walk the checklist, update the design doc

**Files:**

- Create: `fixtures/agent/plan-*.sse`, `fixtures/agent/populate-*.sse`
- Modify: `docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md`

- [ ] **Step 1: Record** — `AGENT_RECORD=1 NODE_USE_SYSTEM_CA=1 npm run dev`, reload, generate from the first example chip. Check `fixtures/agent/` gains one `plan-…step0.sse` and one `populate-fill-slide-N-…step0.sse` per slide.
- [ ] **Step 2: Replay** — restart with `AGENT_REPLAY=1`, reload, click the same chip and generate: the same deck builds with no Sarvam usage. Then "load the sample deck" and send "Make slide 2 more concise": the stage 4 fixture still replays.
- [ ] **Step 3: Design doc** — D2/D3 unchanged; section 5.1: input is `{ mode, messages, deckSnapshot }` (no `slideId`; the populate snapshot names the slide), `max_tokens` 3000 for all modes, `tool_choice` per mode with the Task 2 probe result; section 5.3: rewrite with S5-c to S5-j (plan args incl. `visual`, slides added to the deck as each streamed slide object validates, the title slide filling before the outline completes, partial outlines kept, populate tool subset and scope check, stop-after-first-round rule, layout helper, no canvas follow, per-slide statuses and Retry, one undo step); section 5.6: `plan-`/`populate-` prefixes and the fresh-reload caveat; section 7: the empty deck shows a prompt box with examples, "start with a blank slide", and "load the sample deck"; add a D16 row for S5-a/S5-b (empty start, routing, New deck).
- [ ] **Step 4:** Run the checklist below and fix anything that fails. `npm run typecheck` and `npm run lint` are clean.
- [ ] **Step 5: Commit** — `git add fixtures docs && git commit -m "chore(agent): record generation fixtures; docs: stage 5 decisions"` (plus `fix(generation): stage 5 checklist fixes` if anything needed fixing).

---

## Stage 5 manual checklist (for you)

Run `npm run dev` with `NODE_USE_SYSTEM_CA=1` exported and `SARVAM_API_KEY` in `.env.local`; open http://localhost:3000. Reload before each numbered item. Items 2–8 spend about ₹1 each; use `AGENT_REPLAY=1` with the recorded example to repeat them for free.

**Empty state and generation**

1. A fresh load shows "Create a presentation" with a prompt box, three example chips (clicking one fills the box), and "start with a blank slide" / "load the sample deck". The chat says to describe a presentation, and its input placeholder says the same. New deck is disabled.
2. Generate the first example. Within 1–2 seconds slide 1 appears and the canvas moves to it. The remaining slides (5–7 in total) are added to the filmstrip one by one while the plan streams, with a shimmering ghost at the end showing the title currently being outlined. The deck doesn't wait until the end and then appear all at once.
3. The title slide shows "Writing this slide…" and gets its centered subtitle while later slides are still being added. No other slide starts filling until the ghost disappears.
4. While the other slides fill: at most two body slides show "Writing this slide…" at once, the rest say "Queued" with a skeleton shaped like their layout. Elements pulse green as they land, the canvas doesn't jump between slides, and the chat counts "Filling slides · n of N".
5. When it finishes, the chat has one closing sentence. The deck has at least one chart and one table. No slide has overlapping content; the title slide has a centered subtitle under the title; a chart-forward slide puts the chart left and a short text right.
6. Hover Undo: "Undo: AI: A 6-slide deck on…". One ⌘Z empties the deck and shows the prompt box; ⌘⇧Z brings the whole deck back.
7. Type a deck description in the chat (not the canvas box) on an empty deck: it generates the same way.

**After generation**

8. "Make slide 2 more concise": the stage 4 edit flow patches only slide 2 (receipts, pulse, one undo step). Asking "make me a new deck about cats" gets a reply pointing to New deck, and the deck is unchanged.
9. Click New deck: the prompt box returns and the header says "Untitled deck". ⌘Z restores the previous deck.

**Stop, errors, and concurrency**

10. Generate, then press Stop while slides are filling: a note says what was kept. Unfilled slides show "This slide wasn't filled · Fill with AI" on the canvas and a gray dot on the thumbnail. Click Fill with AI: only that slide fills, and ⌘Z undoes only that fill.
11. Generate, and press Stop after 2–3 slides have appeared but while the ghost is still showing: the note says "Stopped while outlining" with the slide count. Those slides stay, the deck title is set from slide 1, unfilled ones show Fill with AI, and one ⌘Z removes them all.
12. Generate, and stop the dev server (Ctrl+C) while slides are filling. Those slides show "Couldn't fill this slide" with a network error, an amber thumbnail dot, and Retry in both the canvas strip and the chat progress list. Restart the server, click Retry: the slide fills.
13. Remove `SARVAM_API_KEY` and restart: Generate shows a red notice with Retry and the deck stays empty. Restore the key, restart, click Retry: it generates.
14. Drag an element on a filled slide while other slides are still filling: no crash, your move is kept.

**Replay and regressions**

15. `AGENT_REPLAY=1`, reload, generate the first example: the same deck builds without Sarvam usage, and slides still appear one by one. Load the sample deck and send "Make slide 2 more concise": the stage 4 recording replays.
16. `npm run typecheck` and `npm run lint` are clean.
