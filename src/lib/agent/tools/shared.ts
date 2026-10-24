import { z } from "zod";
import type { Op, OpResult } from "@/lib/deck/ops";
import { TextStyleSchema, type Deck, type ElementOf, type ElementType } from "@/lib/deck/schema";

export type ToolContext = { deck: () => Deck; apply: (ops: Op[]) => OpResult[] };

export type ToolOutcome =
  | { ok: true; summary: string; touched: string[]; data?: Record<string, unknown> }
  | { ok: false; error: string };

export type AgentTool = {
  name: string;
  description: string;
  args: z.ZodType;
  execute: (rawArgs: unknown, ctx: ToolContext) => ToolOutcome;
};

export function defineTool<S extends z.ZodType>(spec: {
  name: string;
  description: string;
  args: S;
  run: (args: z.infer<S>, ctx: ToolContext) => ToolOutcome;
}): AgentTool {
  return {
    name: spec.name,
    description: spec.description,
    args: spec.args,
    execute(rawArgs, ctx) {
      const parsed = spec.args.safeParse(rawArgs);
      if (!parsed.success) return fail(`Invalid arguments:\n${z.prettifyError(parsed.error)}`);
      return spec.run(parsed.data, ctx);
    },
  };
}

export const fail = (error: string): ToolOutcome => ({ ok: false, error });

export const done = (summary: string, touched: string[], data?: Record<string, unknown>): ToolOutcome =>
  data ? { ok: true, summary, touched, data } : { ok: true, summary, touched };

export function applyOne(ctx: ToolContext, op: Op): OpResult {
  return ctx.apply([op])[0] ?? { ok: false, error: "Operation produced no result" };
}

export function applyCreate(ctx: ToolContext, op: Op): { id: string } | { error: string } {
  const result = applyOne(ctx, op);
  if (!result.ok) return { error: result.error };
  return result.id ? { id: result.id } : { error: "Nothing was created" };
}

export function slideLabel(deck: Deck, slideId: string): string {
  const index = deck.slideOrder.indexOf(slideId);
  return index === -1 ? slideId : `slide ${index + 1}`;
}

export function findElement<T extends ElementType = ElementType>(deck: Deck, id: string, type?: T): ElementOf<T> | string {
  const element = deck.elements[id];
  if (!element) return `Element ${id} not found`;
  if (type && element.type !== type) return `Element ${id} is a ${element.type}, not a ${type}`;
  return element as ElementOf<T>;
}

export const SlideIdArg = z.string().describe("Slide id from the snapshot, e.g. s3");
export const ElementIdArg = z.string().describe("Element id from the snapshot, e.g. e12");

export const BoxArg = z
  .object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
  .describe("Position and size in artboard units (1600x900). Omit to let the editor place it");

export const TextStyleArg = TextStyleSchema.partial().extend({
  color: TextStyleSchema.shape.color.optional().describe("Hex color, e.g. #0f172a"),
});
