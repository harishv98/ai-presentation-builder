import { current, enablePatches, produceWithPatches, type Draft, type Patch } from "immer";
import { clampBox, isFiniteBox } from "./geometry";
import type {
  Box,
  ChartPayload,
  Deck,
  Element,
  ImagePayload,
  ShapePayload,
  Slide,
  TablePayload,
  TextPayload,
  TextStyle,
} from "./schema";

enablePatches();

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewElement = DistributiveOmit<Element, "id" | "slideId">;

export type ElementPatch = {
  box?: Partial<Box>;
  text?: Partial<Omit<TextPayload, "style">> & { style?: Partial<TextStyle> };
  image?: Partial<ImagePayload>;
  chart?: Partial<ChartPayload>;
  table?: Partial<TablePayload>;
  shape?: Partial<ShapePayload>;
};

export type Op =
  | { op: "add_slide"; slide?: Partial<Omit<Slide, "id" | "elementOrder">>; index?: number }
  | { op: "update_deck"; patch: { title?: string } }
  | { op: "update_slide"; id: string; patch: Partial<Pick<Slide, "title" | "layout" | "background" | "notes">> }
  | { op: "delete_slide"; id: string }
  | { op: "reorder_slides"; id: string; toIndex: number }
  | { op: "duplicate_slide"; id: string }
  | { op: "add_element"; slideId: string; element: NewElement; index?: number }
  | { op: "update_element"; id: string; patch: ElementPatch }
  | { op: "move_element"; id: string; toSlideId?: string; box?: Partial<Box>; copy?: boolean }
  | { op: "delete_element"; id: string }
  | { op: "reorder_element"; id: string; direction: "forward" | "backward" | "front" | "back" };

export type OpResult = { ok: true; id?: string } | { ok: false; error: string };

export type ApplyOpsOutput = {
  deck: Deck;
  results: OpResult[];
  patches: Patch[];
  inversePatches: Patch[];
};

export function applyOpsToDeck(deck: Deck, ops: Op[]): ApplyOpsOutput {
  const results: OpResult[] = [];
  const [next, patches, inversePatches] = produceWithPatches(deck, (draft) => {
    for (const op of ops) results.push(applyOne(draft, op));
  });
  return { deck: next, results, patches, inversePatches };
}

const ok = (id?: string): OpResult => (id === undefined ? { ok: true } : { ok: true, id });
const fail = (error: string): OpResult => ({ ok: false, error });

function applyOne(draft: Draft<Deck>, op: Op): OpResult {
  switch (op.op) {
    case "update_deck": {
      if (op.patch.title !== undefined) draft.title = op.patch.title;
      return ok();
    }

    case "add_slide": {
      const id = newId(draft, "s");
      draft.slides[id] = {
        title: "Untitled",
        layout: "blank",
        background: { color: "#ffffff" },
        notes: "",
        ...op.slide,
        id,
        elementOrder: [],
      };
      insertAt(draft.slideOrder, id, op.index);
      return ok(id);
    }

    case "update_slide": {
      const slide = draft.slides[op.id];
      if (!slide) return fail(`Slide ${op.id} not found`);
      Object.assign(slide, op.patch);
      return ok(op.id);
    }

    case "delete_slide": {
      const slide = draft.slides[op.id];
      if (!slide) return fail(`Slide ${op.id} not found`);
      for (const elementId of slide.elementOrder) delete draft.elements[elementId];
      delete draft.slides[op.id];
      removeFrom(draft.slideOrder, op.id);
      return ok(op.id);
    }

    case "reorder_slides": {
      if (!draft.slides[op.id]) return fail(`Slide ${op.id} not found`);
      removeFrom(draft.slideOrder, op.id);
      insertAt(draft.slideOrder, op.id, op.toIndex);
      return ok(op.id);
    }

    case "duplicate_slide": {
      const source = draft.slides[op.id];
      if (!source) return fail(`Slide ${op.id} not found`);
      const id = newId(draft, "s");
      const snapshot = current(source);
      const copy: Slide = { ...snapshot, id, title: `${snapshot.title} (copy)`, elementOrder: [] };
      draft.slides[id] = copy;
      for (const elementId of snapshot.elementOrder) {
        const element = draft.elements[elementId];
        if (element) cloneElementInto(draft, current(element), draft.slides[id]!);
      }
      insertAt(draft.slideOrder, id, draft.slideOrder.indexOf(op.id) + 1);
      return ok(id);
    }

    case "add_element": {
      const slide = draft.slides[op.slideId];
      if (!slide) return fail(`Slide ${op.slideId} not found`);
      if (!isFiniteBox(op.element.box)) return fail("Element box must have finite x, y, w, h");
      const id = newId(draft, "e");
      draft.elements[id] = { ...op.element, id, slideId: op.slideId, box: clampBox(op.element.box) } as Element;
      insertAt(slide.elementOrder, id, op.index);
      return ok(id);
    }

    case "update_element": {
      const element = draft.elements[op.id];
      if (!element) return fail(`Element ${op.id} not found`);
      const { box, ...payloadPatch } = op.patch;

      for (const key of Object.keys(payloadPatch)) {
        if (key !== element.type) return fail(`Element ${op.id} is a ${element.type}, cannot apply ${key} patch`);
      }
      if (box) {
        const merged = { ...element.box, ...box };
        if (!isFiniteBox(merged)) return fail("Element box must have finite x, y, w, h");
        element.box = clampBox(merged);
      }
      mergePayload(element, payloadPatch);
      return ok(op.id);
    }

    case "move_element": {
      const element = draft.elements[op.id];
      if (!element) return fail(`Element ${op.id} not found`);
      const targetSlideId = op.toSlideId ?? element.slideId;
      const target = draft.slides[targetSlideId];
      if (!target) return fail(`Slide ${targetSlideId} not found`);

      const box = { ...element.box, ...op.box };
      if (!isFiniteBox(box)) return fail("Element box must have finite x, y, w, h");

      if (op.copy) {
        const id = cloneElementInto(draft, { ...current(element), box }, target);
        return ok(id);
      }
      if (targetSlideId !== element.slideId) {
        const source = draft.slides[element.slideId];
        if (source) removeFrom(source.elementOrder, op.id);
        target.elementOrder.push(op.id);
        element.slideId = targetSlideId;
      }
      element.box = clampBox(box);
      return ok(op.id);
    }

    case "delete_element": {
      const element = draft.elements[op.id];
      if (!element) return fail(`Element ${op.id} not found`);
      const slide = draft.slides[element.slideId];
      if (slide) removeFrom(slide.elementOrder, op.id);
      delete draft.elements[op.id];
      return ok(op.id);
    }

    case "reorder_element": {
      const element = draft.elements[op.id];
      if (!element) return fail(`Element ${op.id} not found`);
      const slide = draft.slides[element.slideId];
      if (!slide) return fail(`Slide ${element.slideId} not found`);
      const order = slide.elementOrder;
      const from = order.indexOf(op.id);
      const to = {
        forward: Math.min(from + 1, order.length - 1),
        backward: Math.max(from - 1, 0),
        front: order.length - 1,
        back: 0,
      }[op.direction];
      order.splice(from, 1);
      order.splice(to, 0, op.id);
      return ok(op.id);
    }
  }
}

function newId(draft: Draft<Deck>, prefix: "s" | "e"): string {
  const id = `${prefix}${draft.nextId}`;
  draft.nextId += 1;
  return id;
}

function cloneElementInto(draft: Draft<Deck>, element: Element, slide: Draft<Slide>): string {
  const id = newId(draft, "e");
  draft.elements[id] = { ...structuredClone(element), id, slideId: slide.id, box: clampBox(element.box) };
  slide.elementOrder.push(id);
  return id;
}

function mergePayload(element: Draft<Element>, patch: Omit<ElementPatch, "box">): void {
  switch (element.type) {
    case "text": {
      const { style, ...rest } = patch.text ?? {};
      Object.assign(element.text, rest);
      if (style) Object.assign(element.text.style, style);
      return;
    }
    case "image":
      Object.assign(element.image, patch.image);
      return;
    case "chart":
      Object.assign(element.chart, patch.chart);
      return;
    case "table":
      Object.assign(element.table, patch.table);
      return;
    case "shape":
      Object.assign(element.shape, patch.shape);
      return;
  }
}

function insertAt(list: string[], id: string, index?: number): void {
  const at = index === undefined ? list.length : Math.min(Math.max(Math.trunc(index), 0), list.length);
  list.splice(at, 0, id);
}

function removeFrom(list: string[], id: string): void {
  const at = list.indexOf(id);
  if (at !== -1) list.splice(at, 1);
}
