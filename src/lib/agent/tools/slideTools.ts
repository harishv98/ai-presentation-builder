import { z } from "zod";
import { SlideLayoutSchema } from "@/lib/deck/schema";
import { titleElement } from "../placement";
import { applyCreate, applyOne, defineTool, done, fail, slideLabel, SlideIdArg } from "./shared";

const addSlide = defineTool({
  name: "add_slide",
  description:
    "Add a slide. Non-blank layouts get a title text box showing the title. Add content afterwards with add_element, add_chart, or add_table.",
  args: z.object({
    title: z.string().min(1).max(120),
    layout: SlideLayoutSchema,
    afterSlideId: SlideIdArg.optional().describe("Insert after this slide. Omit to append at the end"),
    notes: z.string().optional().describe("Speaker notes"),
  }),
  run(args, ctx) {
    const deck = ctx.deck();
    let index: number | undefined;
    if (args.afterSlideId) {
      const at = deck.slideOrder.indexOf(args.afterSlideId);
      if (at === -1) return fail(`Slide ${args.afterSlideId} not found`);
      index = at + 1;
    }
    const slide = applyCreate(ctx, {
      op: "add_slide",
      index,
      slide: { title: args.title, layout: args.layout, notes: args.notes ?? "" },
    });
    if ("error" in slide) return fail(slide.error);

    const data: Record<string, unknown> = { slideId: slide.id };
    const touched = [slide.id];
    if (args.layout !== "blank") {
      const title = applyCreate(ctx, { op: "add_element", slideId: slide.id, element: titleElement(args.title, args.layout) });
      if ("id" in title) {
        data.titleElementId = title.id;
        touched.push(title.id);
      }
    }
    return done(`Added ${slideLabel(ctx.deck(), slide.id)} "${args.title}"`, touched, data);
  },
});

const updateSlide = defineTool({
  name: "update_slide",
  description:
    "Change slide metadata: title (shown in the slide list, not on the slide), speaker notes, background color. To change the visible heading, update the title text element.",
  args: z.object({
    slideId: SlideIdArg,
    title: z.string().min(1).max(120).optional(),
    notes: z.string().optional(),
    backgroundColor: z.string().optional().describe("Hex color"),
  }),
  run({ slideId, backgroundColor, ...rest }, ctx) {
    const patch = { ...rest, ...(backgroundColor && { background: { color: backgroundColor } }) };
    if (Object.keys(patch).length === 0) return fail("Pass at least one of title, notes, backgroundColor");
    const result = applyOne(ctx, { op: "update_slide", id: slideId, patch });
    return result.ok ? done(`Updated ${slideLabel(ctx.deck(), slideId)}`, [slideId]) : fail(result.error);
  },
});

const deleteSlide = defineTool({
  name: "delete_slide",
  description: "Delete a slide and everything on it.",
  args: z.object({ slideId: SlideIdArg }),
  run({ slideId }, ctx) {
    const deck = ctx.deck();
    const slide = deck.slides[slideId];
    if (!slide) return fail(`Slide ${slideId} not found`);
    const label = slideLabel(deck, slideId);
    const result = applyOne(ctx, { op: "delete_slide", id: slideId });
    return result.ok ? done(`Deleted ${label} "${slide.title}"`, []) : fail(result.error);
  },
});

const reorderSlides = defineTool({
  name: "reorder_slides",
  description: "Move a slide to a new position in the deck.",
  args: z.object({
    slideId: SlideIdArg,
    toPosition: z.number().int().min(1).max(500).describe("1-based position, as numbered in the snapshot"),
  }),
  run({ slideId, toPosition }, ctx) {
    const deck = ctx.deck();
    const slide = deck.slides[slideId];
    if (!slide) return fail(`Slide ${slideId} not found`);
    const result = applyOne(ctx, { op: "reorder_slides", id: slideId, toIndex: toPosition - 1 });
    if (!result.ok) return fail(result.error);
    return done(`Moved "${slide.title}" to ${slideLabel(ctx.deck(), slideId)}`, [slideId]);
  },
});

const duplicateSlide = defineTool({
  name: "duplicate_slide",
  description: "Copy a slide with all its elements; the copy is inserted right after it.",
  args: z.object({ slideId: SlideIdArg }),
  run({ slideId }, ctx) {
    const label = slideLabel(ctx.deck(), slideId);
    const copy = applyCreate(ctx, { op: "duplicate_slide", id: slideId });
    if ("error" in copy) return fail(copy.error);
    return done(`Duplicated ${label}`, [copy.id], { slideId: copy.id });
  },
});

const changeLayout = defineTool({
  name: "change_layout",
  description: "Change a slide's layout hint. Elements keep their positions; move or resize them separately if needed.",
  args: z.object({ slideId: SlideIdArg, layout: SlideLayoutSchema }),
  run({ slideId, layout }, ctx) {
    const result = applyOne(ctx, { op: "update_slide", id: slideId, patch: { layout } });
    return result.ok ? done(`Changed ${slideLabel(ctx.deck(), slideId)} layout to ${layout}`, [slideId]) : fail(result.error);
  },
});

export const slideTools = [addSlide, updateSlide, deleteSlide, reorderSlides, duplicateSlide, changeLayout];
