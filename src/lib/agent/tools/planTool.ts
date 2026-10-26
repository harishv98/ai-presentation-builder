import { z } from "zod";
import { SlideLayoutSchema } from "@/lib/deck/schema";
import { titleElement } from "../deck/placement";
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
