Assignment
Technical Assignment: AI-Powered Presentation Builder
Background
Tools like Gamma, Kimi Slides, and Tome have changed how people create presentations. Instead of starting from a blank canvas, users describe what they want, and AI generates a first draft — which they then refine through conversation and manual edits. The best of these products feel like a real slide editor, not a chat window that dumps markdown: you can grab a chart, drag it across the canvas, drop a text block onto another slide, and still ask the AI to rewrite the story.

We want to see how you approach building a product in this space.

What You Are Building
A web-based AI Presentation Builder where a user can:

Generate slides from a prompt. The user describes a topic or provides an outline (e.g., “Create a 5-slide deck on our Q3 product roadmap”), and the AI generates a first-cut presentation — multiple slides with titles, body content, charts, images, tables, and a coherent structure.

Iterate on slides through conversation. The user can ask the AI to improve or modify the deck in natural language — e.g., “Make slide 3 more concise”, “Add a slide about pricing before the conclusion”, “Change the tone to be more formal”, “Rewrite the bullet points on slide 2 as a comparison table”, “Turn the Q3 numbers on slide 4 into a bar chart”, “Move the pricing table to the appendix”. The AI applies these changes and the user sees the updated slides.

Edit slides as a canvas, not a document. Each slide is a free-form canvas of positioned elements (text, images, charts, tables, shapes). The user can click into any element and edit it, drag it around, resize it, and delete it — without going through the AI.

Full drag and drop. Drag to reorder slides in a filmstrip / navigator. Drag elements to new positions on the current slide. Drag an element from one slide onto another (filmstrip thumbnail, adjacent slide, or drop zone) so it moves or copies across slides. Dropping should feel precise: snap-to-grid or alignment guides, collision-aware placement, and a visible drop target.

Charts and graphs as first-class objects. Users and the AI can insert bar, line, pie, area, and comparison charts. Charts have editable data, a type, axis / legend settings, and a position/size on the canvas. They can be dragged, resized, duplicated, and moved to another slide just like any other element.

Manual and AI edits coexist. Reorder slides, delete slides, add a blank slide, insert an element, or ask the AI to do it. Manual edits and AI-driven edits must share one source of truth — neither path may clobber the other.

The core loop is: prompt → AI generates → user reviews → user asks AI to refine OR edits / drags / rearranges manually → repeat.

Technical Expectations
This is not “call an LLM and render its text output.” We expect a thoughtfully designed agentic system. The following are baseline requirements, not bonus points:

1. Structured Output with a Slide + Element Schema
The AI must return slides as structured JSON conforming to a schema you design — not freeform markdown or plain text. Your schema should model:

Deck-level metadata: title, theme, aspect ratio (16:9 required).

Slide-level: id, type / layout hint (title, content, two-column, comparison, section break, chart-forward, etc.), background, speaker notes, z-order of children.

Element-level (this is the important part): every piece of content on a slide is an element with a stable id, a type (text, image, chart, table, shape, icon, …), a bounding box (x, y, width, height in slide-relative units), rotation if you support it, and type-specific payload (rich text, image src, chart spec, table rows, etc.).

The schema is the backbone of your product — a slide that is only { title, bullets } cannot support drag-and-drop, charts, or moving objects between slides. Design for elements from day one.

2. Agentic Tool-Use (Function Calling)
The AI must operate via tool calls / function calling, not a single monolithic prompt that returns the entire deck. Define tools at both slide and element granularity, for example:

Slides: add_slide, update_slide, delete_slide, reorder_slides, duplicate_slide, change_layout.

Elements: add_element, update_element, delete_element, move_element (including to a different slide), resize_element, reorder_elements (z-index).

Charts: add_chart, update_chart_data, change_chart_type.

When the user says “make slide 3 more concise”, the AI should call update_element / update_slide on the affected content — not regenerate the whole deck. When they say “move that bar chart to the last slide”, the AI should call move_element with the chart id and destination slide id. The AI decides which tool to invoke based on the user’s intent.

3. Diff-Based Edits (Targeted Patches, Not Full Regeneration)
When the user asks for a change, the AI must return a targeted patch — the specific slide(s), element(s), or field(s) to update — not a full regeneration of the entire deck. Full regeneration destroys manual edits (a dragged chart, a rewritten headline, a reordered filmstrip) and is not acceptable. Your state model must support applying surgical updates to individual slides and elements while preserving everything else.

4. Two-Phase Generation
Initial deck creation may be a plan, then populate flow: first produce an outline / slide list (titles + layout intent), then fill each slide with elements. Subsequent edits must stay on the patch path above. Do not skip planning and dump 10 fully authored slides from one unstructured completion.

5. One Canonical Deck Store
Chat, canvas, filmstrip, keyboard shortcuts, undo, and export all read and write the same in-memory deck. A drag that moves a chart from slide 2 to slide 5 must be visible to the AI on the next turn (it sees the new parent slide). An AI move_element must animate / appear on the canvas without a full remount. If you have two copies of “the deck”, you will lose.

Scope & Requirements
Must Have
Shell & conversation

A chat interface where the user describes their presentation or asks for changes, and the AI responds by generating or modifying slides.

The AI must work on the actual slide data — when it modifies slides or elements, the changes appear in the editor in real time. Do not mock the AI integration.

All Technical Expectations above (schema, agentic tool-use, diff-based edits, two-phase generation, canonical store) must be implemented.

Streaming responses — slides (and, where possible, elements) appear as the LLM streams / as tools land, rather than a loading spinner followed by a sudden dump.

Canvas editor

A slide canvas that renders the current slide from the element schema at a fixed 16:9 artboard. This is an editor, not a static preview.

Select, inline-edit, delete any element. Text is editable in place. Chart data and table cells are editable (inline or in a side inspector — your choice, but it must be real).

Insert new elements onto the current slide from a toolbar / insert menu: text box, image, chart, table, shape. Inserted elements land on the canvas with a default size and can be moved immediately.

Resize via handles. Z-order: bring forward / send backward (or equivalent).

Duplicate the selected element (⌘/Ctrl+D or an explicit action).

Multi-select (shift-click or marquee) and move the selection as a group.

Visual alignment guides / snap-to-grid while dragging so placement is not guesswork. Show a selected-element bounding box and resize handles.

Full drag and drop

Reorder slides by dragging thumbnails in a filmstrip / navigator (vertical or horizontal). Drop indicator must make the insertion index obvious.

Reposition elements on the current slide by dragging. Drag origin can be the element itself; dropping updates x/y in the schema.

Move (or copy) an element from one slide to another. At minimum one of these must work, and both is better:

Drag an element from the canvas onto another slide’s thumbnail in the filmstrip.

Drag an element onto a “drop on slide N” target, or into an adjacent-slide preview.

Modifier key to copy vs move (e.g. hold Alt/Option to copy). If you only implement move, say so in the README — copy is still expected if time allows.

Drag must be cancellable (Escape restores the original position / parent).

Dropping an element onto a slide that cannot reasonably fit it (e.g. a huge chart on a title slide) should still succeed: clamp position/size into the artboard rather than fail silently or overflow.

Charts & rich content

Charts / graphs as first-class elements, not screenshots. Support at least bar, line, and pie. Area or stacked-bar is a plus.

A chart has: type, title, categories / series, numeric data, and optional colors. The user can edit the data after insertion (a small data table / inspector is fine). Changing type (bar → line) keeps the data.

The AI can create and update charts via tools (add_chart, update_chart_data, change_chart_type) from a prompt like “add a bar chart of quarterly revenue” or “switch the chart on slide 4 to a line chart”.

Tables generated and editable (rows/cols, cell text).

Images on slides: AI-placed (URL or generated placeholder) and user-uploaded (file picker). Images are elements — they drag, resize, and move across slides too.

Export must render charts, tables, and images, not only text.

Slide operations

Add, delete, duplicate, reorder, and rename / retitle slides manually.

Add a blank slide at a chosen index (after current, at end).

Click a filmstrip thumbnail to navigate. Keyboard: previous / next slide.

Export, history, quality

The presentation should be exportable (PDF, PPTX, or at minimum a printable HTML view that includes charts and positioned elements). If full export is too ambitious, a clean print-to-PDF view is acceptable — but state this decision in your README.

Undo / redo for canvas operations (move, resize, delete, reorder, cross-slide move) at minimum. AI tool applications should also be undoable if they write the same store. A unified history stack is the goal; if AI undo is incomplete, document it.

Empty, loading, and error states for chat and for a deck with zero slides.

Nice to Have (prioritize if time permits)
Slide themes / templates (let the user pick a visual style; applying a theme restyles elements without destroying positions or content).

Present / slideshow mode (fullscreen, arrow keys, escape to exit).

Context window management — smart handling of what gets sent to the LLM as conversations grow long (token limits, summarization of older slides).

Multiple presentation projects (a dashboard listing saved decks).

Copy / paste elements between slides and, if feasible, from an external spreadsheet into a table or chart.

Lock an element so neither drag nor AI tools can move it until unlocked.

Group / ungroup elements.

Speaker notes editor + notes visible in present mode.

Chart extras: stacked bar, scatter, dual axis, data labels, CSV paste into chart data.

Image crop, and replace-image on an existing image element.

Keyboard nudging (arrow keys move selection by a snap increment; Shift for larger steps).

Collaborative-feeling polish: live selection outline when the AI is about to patch an element, or a brief highlight on the element a tool just touched.

Persist decks in localStorage / IndexedDB so a refresh does not wipe work.

Explicitly Out of Scope
Authentication is not required. You can use a single-user, no-auth model. If you add auth, it will not earn extra credit — spend that time on the core product instead.

No backend persistence is strictly required. If you persist data in localStorage or IndexedDB, that is fine. If you want a backend, keep it minimal.

Real-time multiplayer / CRDT collaboration.

Pixel-perfect PowerPoint clone (master slides, animations timeline, SmartArt). A solid canvas with DnD, charts, and cross-slide moves beats an animation engine.

Custom font foundry, brand-kit upload, or video embeds.

Technical Guidelines
Use AI to build this assignment
We encourage and expect you to use AI tools (ChatGPT, Claude, Copilot, Cursor, etc.) throughout the development process — for planning, coding, debugging, and design decisions. This mirrors how our team works day to day.

However:

You must understand every line of code you submit. If asked to explain a design decision or walk through a specific implementation during the review, you should be able to do so confidently.

Do not mock the core product. Since you are allowed to use AI, we expect a complete, working, end-to-end implementation — not a prototype with stubbed functionality. The AI slide generation, the chat-based refinement, the canvas (drag, resize, cross-slide move), charts with real data, and manual editing must all genuinely work. A chart that is a static PNG, a “drag” that is really two dropdowns, or a filmstrip that cannot accept a dropped element does not count.

Build a real product, not a demo with hardcoded responses.

LLM for the agentic part
Use any LLM that supports tool calling for the slide generation and refinement logic. Sarvam models are available to you — sign up on the Sarvam dashboard and you receive 100 credits. If you need more, reach out to us.

There is no requirement to use Sarvam models. Any model is fine, including free models from other providers (listed below) or a model you run locally.

The LLM must use function calling / tool use — not return the entire deck as freeform text from a single prompt. Define a tool set at slide and element granularity (add, update, delete, reorder, move, add_chart, …) and let the model decide which to invoke. Pick a model that actually supports tool calling; a free chat model that cannot call tools will not meet this assignment.

Design a slide + element schema (structured JSON) that the LLM returns and the frontend renders. The schema is your contract between AI and UI — including bounding boxes and chart specs, not only titles and bullets.

The AI must be context-aware — it should know the current state of the deck (slide titles, element ids/types/positions, chart data, order) when making changes, so it returns targeted diffs, not full regenerations. After the user drags a chart to another slide, the next AI turn must see that chart on the new slide.

Include your API key handling safely. Do not hardcode keys in the repo. Use environment variables and document the setup.

Free models you can use instead

Sarvam models are optional. These providers currently offer a free tier you can use for this assignment. Quotas and model lists change — confirm the current limits on the provider’s dashboard before you depend on them.

Google Gemini — Gemini dashboard (Google AI Studio). Sign in with a Google account, create an API key, and use the free tier. Live quotas (requests and tokens) are on that dashboard under Usage. Rate limits.

Groq — Groq console. Free tier for open models such as GPT-OSS (openai/gpt-oss-120b, openai/gpt-oss-20b) and Qwen. Current limits.

OpenRouter — free models and the openrouter/free router, which picks a free model that supports your request (including tool calling). Call any model id ending in :free. Accounts that have not purchased credits are limited to about 20 requests per minute and 50 per day. Free variant docs.

Mistral — La Plateforme. New accounts start in Free mode for prototyping. Exact limits are shown in the console, not published as a fixed grant.

Local — Ollama or any other local runtime. No signup and no provider quota. Still has to support tool calling.

Tech Stack
Frontend: React (Next.js preferred, but any React framework is fine).

Styling: Any CSS framework or design system you are comfortable with.

LLM integration: Any provider. Use their SDK or API directly.

State management: Your choice. Keep it simple and appropriate for the problem.

Drag and drop: Use a library (dnd-kit, react-dnd, Pointer Events, etc.) or roll your own. Either is fine if the UX is solid. Native HTML5 DnD often fights canvas coordinates — pick something you can debug.

Charts: Use a real chart library (Recharts, visx, Chart.js, Nivo, ECharts, etc.). Do not fake graphs with CSS bars or screenshots.

Timeline
Maximum: 2 calendar days from when you start. This is a hard deadline.

Earlier submission is better. A clean, working submission on Day 1 is more impressive than a sprawling, half-finished one on Day 2.

Prioritize a working core loop over breadth. A polished generate → refine → canvas-edit cycle (including real drag-and-drop and at least one chart type) beats 15 features that are all half-baked.

If you cannot finish everything in 2 days, submit what works and document what is incomplete and why. We evaluate on engineering judgment, not feature count alone. Do not skip the canvas: text-only slides with no drag, no charts, and no cross-slide moves miss the product. Cut themes, present mode, and multi-project before you cut DnD or charts.

Deliverables
You must submit all three of the following:

1. Deployed URL
A live, accessible URL where we can use the product immediately — no local setup required.

Use any free hosting platform (Vercel, Netlify, Railway, Render, etc.).

The deployed app must be functional. If we visit the URL and see a blank page or a crash, that counts as not submitted.

2. Source Code
A Git repository (GitHub preferred) with clean commit history.

Include a README.md with:

Setup instructions (env vars, install, run commands).

A brief architecture overview (what lives where, data flow: schema → store → canvas / filmstrip / chat tools → export).

How drag-and-drop and cross-slide moves are implemented (library, coordinate space, what happens on drop).

Any known issues or incomplete features, clearly called out.

3. AI Chat Transcripts (Preferred, but optional)
Export and submit the transcripts of your conversations with AI tools (ChatGPT, Claude, Cursor, Copilot, etc.) during this assignment.

This is not a test of whether you used AI “too much” — we want to see how you use it: the quality of your prompts, how you debug, how you steer the AI when it goes wrong, and where you chose to write code yourself instead.

If you used multiple tools, include transcripts from each.

Export formats: PDF, text, or markdown — whatever the tool supports. Just make sure the content is readable.

What We Will Try
When we open your deployed URL, we will roughly:

Prompt: generate a 5–7 slide deck that includes at least one chart and one table.

Ask the AI to rewrite a single slide and to add a chart from a short data blurb — confirm it patches, not regenerates.

Drag slides in the filmstrip to reorder.

Drag a text box and a chart to new positions; resize both.

Drag a chart (or table) from the current slide onto another slide’s thumbnail and confirm it now lives there. Then ask the AI something about “the chart” and confirm it knows which slide it is on.

Undo the last canvas move.

Export / print and check that charts and positions survived.

If step 5 is missing, say so up front in the README. We would rather see an honest gap than a broken drop target.

Good luck. Build something you would actually want to use.