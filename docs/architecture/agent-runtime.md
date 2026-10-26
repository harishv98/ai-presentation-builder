# Agent runtime

The browser-side machinery shared by [deck generation](deck-generation.md) and the [edit agent](edit-agent.md): the tool loop, tool execution and scoping, the tool definitions, the deck snapshot the model reads, automatic layout, and the "reveal" feedback after an AI change.

[← Back to the architecture overview](../ARCHITECTURE.md)

## Where it sits in the flow

Step 5 of the [end-to-end flow](../ARCHITECTURE.md#1-end-to-end-flow). The flows hand it prompts; it sends requests through [streaming](streaming.md), turns completed tool calls into [ops](deck-model.md), and feeds the results back to the model.

## Files

| File | Purpose |
|---|---|
| `lib/agent/runtime/toolLoop.ts` | `runToolLoop`: stream a step, execute calls, feed results back, repeat. |
| `lib/agent/runtime/executeTool.ts` | `executeToolCall`, scoping rules, `aiToolContext`, `autoArrange`, `newUndoGroup`. |
| `lib/agent/runtime/reveal.ts` | `revealAiChanges`: pulse and follow. |
| `lib/agent/tools/index.ts` | All tools, the tool set per mode, and conversion to OpenAI JSON Schema. Imported by the server too. |
| `lib/agent/tools/shared.ts` | `defineTool`, `ToolContext`, `ToolOutcome`, and shared argument schemas (`SlideIdArg`, `ElementIdArg`, `BoxArg`, `TextStyleArg`). |
| `lib/agent/tools/slideTools.ts` | `add_slide`, `update_slide`, `delete_slide`, `reorder_slides`, `duplicate_slide`, `change_layout`. |
| `lib/agent/tools/elementTools.ts` | `add_element`, `update_element`, `delete_element`, `move_element`, `resize_element`, `reorder_elements`. |
| `lib/agent/tools/chartTableTools.ts` | `add_chart`, `update_chart_data`, `change_chart_type`, `add_table`, `update_table`. |
| `lib/agent/tools/planTool.ts` | `plan_deck` (see [deck generation](deck-generation.md#plan-step-planoutline)). |
| `lib/agent/deck/snapshot.ts` | `serializeForAI` (edit) and `serializeForPopulate` (populate): the deck as compact text. |
| `lib/agent/deck/placement.ts` | Default text styles per role, title boxes, `placeBox` for elements added without a box, and `stockImageUrl`. |
| `lib/agent/deck/arrange.ts` | `arrangeSlide`: layout-aware tidy-up of a slide's body elements. |

## Tool loop

`runToolLoop(prompt, options)` owns the conversation for one AI turn. The caller supplies:

| Option | Role |
|---|---|
| `buildRequest(turn)` | Builds the next `ChatRequest` from the messages of this turn so far. Returning `null` ends the loop (populate does this if its slide was deleted). |
| `execute(call)` | Runs one tool call and returns a `ToolExecution`. Called as soon as each call finishes streaming, not after the whole step. |
| `decide(step)` | After each step: `"continue"`, `"stop"`, or `{ followUp }` to add a user message and continue. |
| `textWriter` | Returns a fresh text sink per step, so each step's text is its own chat message. |
| `maxSteps`, `signal` | Step cap and abort signal. |

Each step appends the assistant message (text plus tool calls) and one `tool` message per execution to the turn, so the next request carries the results. It returns `{ outOfSteps, last }`.

| Caller | Max steps | Stops when |
|---|---|---|
| [Edit agent](edit-agent.md) | 12 | No tool calls |
| [Populate](deck-generation.md#populate-step-populateslide) | 3 | All calls succeeded, or no calls twice |

## Executing a tool call

`executeToolCall(call, scope)` turns one model call into ops and a tool-result message:

1. **Find the tool** for the scope's mode (`findTool(name, mode)`). A tool from another mode is "not available here".
2. **Parse arguments** as JSON.
3. **Slide scope** (populate only): reject a `slideId` other than the target, or an `elementId` on another slide.
4. **Editing conflict:** if the user has a text or cell editor open on an element, reject calls that target it (or delete its slide), with a message telling the model to leave it and continue.
5. **Run** the tool against `aiToolContext(scope)`, which reads the live deck and applies ops with `{ source: "ai", label, txnId }`.
6. **Build the result.** On success: the summary, touched ids, which ids are new, and a description of each changed element's previous state (`previously`). The `content` sent back to the model is JSON: `{ ok, applied, ...data, previously? }`, or `{ ok: false, error }`. A thrown error becomes "Tool crashed: …" rather than ending the turn.

An `UndoGroup` is `{ txnId, label }` from `newUndoGroup(label)`. Every change applied with the same `txnId` merges into one undo entry.

## Tool definitions

Each tool is `defineTool({ name, description, args, run })`:

- `args` is a Zod schema. It validates the arguments (errors go back to the model as "Invalid arguments: …") and is converted to JSON Schema with `z.toJSONSchema` for the request's `tools` list.
- `run(args, ctx)` produces ops through `ctx.apply` and returns `done(summary, touched, data?)` or `fail(error)`.

Tools never touch stores directly; they only see `ToolContext { deck(), apply(ops) }`. That keeps them unit-testable and means AI changes follow the same path as manual ones.

| Mode | Tools | `tool_choice` |
|---|---|---|
| `plan` | `plan_deck` | `auto` (forced to `plan_deck` after 3 questions) |
| `populate` | `add_element`, `update_element`, `add_chart`, `update_chart_data`, `add_table`, `update_table` | `required` |
| `edit` | All 17 slide, element, chart, and table tools | `auto` |

## Deck snapshot

The model never sees deck JSON. `serializeForAI` produces one line per slide and one indented line per element (back to front), using each element type's `describe` from the element registry:

```text
Deck "Solar 2026", 6 slides, artboard 1600x900, current slide: s3
[1] s1 "Solar in 2026" layout=title bg=#ffffff
  e2 text/title @160,300 1280x160 size=88 bold center #0f172a ["Solar in 2026"]
[3] s5 "Capacity growth" layout=chart-forward bg=#ffffff
  e6 text/title @80,60 1440x120 size=60 bold left #0f172a ["Capacity growth"]
  e9 chart/bar @80,220 947x620 title="GW installed" categories=["2023","2024","2025"] series: GW=[12,18,25] legend=false (edited by you this reply)
```

`serializeForPopulate` lists all slides with their outline intent, marks the target with `<- the slide you fill`, and lists only the target slide's elements.

## Placement and arrangement

- **`placeBox`** picks a default box for an element added without one: the title band, or the first of four body slots that overlaps existing elements the least.
- **`arrangeSlide`** returns `update_element` ops that lay out a slide's body elements (everything except the title text) by layout: title and section slides stack rows in a centered hero area; chart-forward with one chart and one text uses a 2:1 split; up to three elements sit in columns; more are split over two rows. Text comes before visuals.
- **`autoArrange(slideId, undoGroup)`** applies those ops in the same undo group and returns the ids that moved.

## Reveal

`revealAiChanges(ids, { follow })` runs after a successful AI change:

- Pulses the touched elements and their slides' thumbnails (`flashAiHighlights`, 1.5 s).
- If `follow` is on (edit agent) and the user isn't busy (dragging, marquee-selecting, reordering slides, renaming, or editing text), goes to the slide of the last touched id. Populate passes `follow: false` so parallel fills don't yank the view around.
