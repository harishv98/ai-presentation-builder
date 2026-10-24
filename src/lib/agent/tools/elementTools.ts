import { z } from "zod";
import type { ElementPatch, NewElement } from "@/lib/deck/ops";
import { ImagePayloadSchema, ShapePayloadSchema, TextPayloadSchema, type Deck, type ElementType } from "@/lib/deck/schema";
import { placeBox, stockImageUrl, textStyle } from "../placement";
import {
  applyCreate,
  applyOne,
  BoxArg,
  defineTool,
  done,
  ElementIdArg,
  fail,
  findElement,
  slideLabel,
  SlideIdArg,
  TextStyleArg,
} from "./shared";

const TextRoleArg = TextPayloadSchema.shape.role;
const ShapeKindArg = ShapePayloadSchema.shape.kind;

const EDIT_HINT: Record<ElementType, string> = {
  text: "update_element with text",
  image: "update_element with image",
  shape: "update_element with shape",
  chart: "update_chart_data or change_chart_type",
  table: "update_table",
};

const addElementArgs = z.object({
  slideId: SlideIdArg,
  type: z.enum(["text", "image", "shape"]),
  text: z
    .object({
      role: TextRoleArg,
      content: z.array(z.string()).min(1).describe("One string per paragraph or bullet"),
      style: TextStyleArg.optional(),
    })
    .optional()
    .describe("Required when type is text"),
  image: z
    .object({ keyword: z.string().min(1).describe("1-3 words for a stock photo"), alt: z.string() })
    .optional()
    .describe("Required when type is image"),
  shape: z
    .object({ kind: ShapeKindArg, fill: z.string(), stroke: z.string().optional() })
    .optional()
    .describe("Required when type is shape"),
  box: BoxArg.optional(),
});

function buildElement(deck: Deck, args: z.infer<typeof addElementArgs>): NewElement | string {
  switch (args.type) {
    case "text": {
      if (!args.text) return "text is required when type is text";
      const { role, content, style } = args.text;
      const layout = deck.slides[args.slideId]?.layout;
      const centered = role !== "title" && (layout === "title" || layout === "section") ? { align: "center" as const } : {};
      const box = args.box ?? placeBox(deck, args.slideId, role === "title" ? "title" : "body");
      return { type: "text", box, text: { role, content, style: textStyle(role, { ...centered, ...style }) } };
    }
    case "image": {
      if (!args.image) return "image is required when type is image";
      const box = args.box ?? placeBox(deck, args.slideId, "body");
      return { type: "image", box, image: { src: stockImageUrl(args.image.keyword), alt: args.image.alt, fit: "cover" } };
    }
    case "shape": {
      if (!args.shape) return "shape is required when type is shape";
      return { type: "shape", box: args.box ?? placeBox(deck, args.slideId, "body"), shape: args.shape };
    }
  }
}

const addElement = defineTool({
  name: "add_element",
  description: "Add a text box, stock image, or shape to a slide. Use add_chart or add_table for charts and tables.",
  args: addElementArgs,
  run(args, ctx) {
    const deck = ctx.deck();
    if (!deck.slides[args.slideId]) return fail(`Slide ${args.slideId} not found`);
    const element = buildElement(deck, args);
    if (typeof element === "string") return fail(element);
    const created = applyCreate(ctx, { op: "add_element", slideId: args.slideId, element });
    if ("error" in created) return fail(created.error);
    return done(`Added ${args.type} to ${slideLabel(deck, args.slideId)}`, [created.id], { elementId: created.id });
  },
});

const updateElementArgs = z.object({
  elementId: ElementIdArg,
  text: z
    .object({
      role: TextRoleArg.optional(),
      content: z.array(z.string()).optional().describe("Replaces all paragraphs/bullets"),
      style: TextStyleArg.optional(),
    })
    .optional(),
  image: z
    .object({
      keyword: z.string().min(1).optional().describe("New stock photo keyword"),
      alt: z.string().optional(),
      fit: ImagePayloadSchema.shape.fit.optional(),
    })
    .optional(),
  shape: z.object({ kind: ShapeKindArg.optional(), fill: z.string().optional(), stroke: z.string().optional() }).optional(),
});

function elementPatch({ text, image, shape }: z.infer<typeof updateElementArgs>): ElementPatch {
  const { keyword, ...imageRest } = image ?? {};
  return {
    ...(text && { text }),
    ...(image && { image: { ...imageRest, ...(keyword && { src: stockImageUrl(keyword) }) } }),
    ...(shape && { shape }),
  };
}

const updateElement = defineTool({
  name: "update_element",
  description:
    "Edit a text, image, or shape element in place. Include only the fields that change. Charts: update_chart_data / change_chart_type. Tables: update_table. Position: move_element / resize_element.",
  args: updateElementArgs,
  run(args, ctx) {
    const deck = ctx.deck();
    const element = findElement(deck, args.elementId);
    if (typeof element === "string") return fail(element);
    const patch = elementPatch(args);
    const keys = Object.keys(patch);
    if (keys.length === 0) return fail("Pass text, image, or shape fields to change");
    if (keys.some((key) => key !== element.type)) {
      return fail(`Element ${element.id} is a ${element.type}; use ${EDIT_HINT[element.type]}`);
    }
    const result = applyOne(ctx, { op: "update_element", id: element.id, patch });
    if (!result.ok) return fail(result.error);
    return done(`Edited ${element.type} ${element.id} on ${slideLabel(deck, element.slideId)}`, [element.id]);
  },
});

const deleteElement = defineTool({
  name: "delete_element",
  description: "Delete an element.",
  args: z.object({ elementId: ElementIdArg }),
  run({ elementId }, ctx) {
    const deck = ctx.deck();
    const element = findElement(deck, elementId);
    if (typeof element === "string") return fail(element);
    const result = applyOne(ctx, { op: "delete_element", id: elementId });
    if (!result.ok) return fail(result.error);
    return done(`Deleted ${element.type} ${elementId} from ${slideLabel(deck, element.slideId)}`, []);
  },
});

const moveElement = defineTool({
  name: "move_element",
  description:
    "Move an element on its slide (x, y) and/or to another slide (toSlideId). copy=true keeps the original and returns the new id. Positions are clamped into the artboard.",
  args: z.object({
    elementId: ElementIdArg,
    toSlideId: SlideIdArg.optional().describe("Destination slide"),
    x: z.number().optional(),
    y: z.number().optional(),
    copy: z.boolean().optional().describe("Copy instead of move"),
  }),
  run(args, ctx) {
    const element = findElement(ctx.deck(), args.elementId);
    if (typeof element === "string") return fail(element);
    if (args.toSlideId === undefined && args.x === undefined && args.y === undefined && !args.copy) {
      return fail("Pass toSlideId and/or x, y");
    }
    const box = { ...(args.x !== undefined && { x: args.x }), ...(args.y !== undefined && { y: args.y }) };
    const moved = applyCreate(ctx, { op: "move_element", id: element.id, toSlideId: args.toSlideId, box, copy: args.copy });
    if ("error" in moved) return fail(moved.error);
    const where = args.toSlideId ? ` to ${slideLabel(ctx.deck(), args.toSlideId)}` : "";
    const verb = args.copy ? "Copied" : "Moved";
    return done(`${verb} ${element.type} ${element.id}${where}`, [moved.id], args.copy ? { elementId: moved.id } : undefined);
  },
});

const resizeElement = defineTool({
  name: "resize_element",
  description: "Set an element's size, and optionally its position. Clamped into the artboard.",
  args: z.object({
    elementId: ElementIdArg,
    w: z.number().positive(),
    h: z.number().positive(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  run({ elementId, w, h, x, y }, ctx) {
    const element = findElement(ctx.deck(), elementId);
    if (typeof element === "string") return fail(element);
    const box = { w, h, ...(x !== undefined && { x }), ...(y !== undefined && { y }) };
    const result = applyOne(ctx, { op: "update_element", id: elementId, patch: { box } });
    return result.ok ? done(`Resized ${element.type} ${elementId}`, [elementId]) : fail(result.error);
  },
});

const Z_VERB = { forward: "Brought %s forward", backward: "Sent %s backward", front: "Brought %s to front", back: "Sent %s to back" };

const reorderElements = defineTool({
  name: "reorder_elements",
  description: "Change an element's stacking order on its slide.",
  args: z.object({
    elementId: ElementIdArg,
    direction: z.enum(["forward", "backward", "front", "back"]).describe("front = on top of everything"),
  }),
  run({ elementId, direction }, ctx) {
    const element = findElement(ctx.deck(), elementId);
    if (typeof element === "string") return fail(element);
    const result = applyOne(ctx, { op: "reorder_element", id: elementId, direction });
    if (!result.ok) return fail(result.error);
    return done(Z_VERB[direction].replace("%s", `${element.type} ${elementId}`), [elementId]);
  },
});

export const elementTools = [addElement, updateElement, deleteElement, moveElement, resizeElement, reorderElements];
