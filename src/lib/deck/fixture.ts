import { applyOpsToDeck, type NewElement, type Op } from "./ops";
import type { Box, Deck, TextPayload, TextStyle } from "./schema";

const INK = "#0f172a";
const BODY = "#334155";

const CONTENT_TITLE_BOX: Box = { x: 80, y: 60, w: 1440, h: 120 };

function text(role: TextPayload["role"], content: string[], box: Box, style: Partial<TextStyle> = {}): NewElement {
  return {
    type: "text",
    box,
    text: {
      role,
      content,
      style: { fontSize: 34, bold: false, italic: false, align: "left", color: BODY, ...style },
    },
  };
}

const contentTitle = (title: string) => text("title", [title], CONTENT_TITLE_BOX, { fontSize: 60, bold: true, color: INK });

const add = (slideId: string, element: NewElement): Op => ({ op: "add_element", slideId, element });

export function createSampleDeck(): Deck {
  const empty: Deck = {
    id: "deck-sample",
    title: "Q3 Product Roadmap",
    theme: "default",
    aspectRatio: "16:9",
    slideOrder: [],
    slides: {},
    elements: {},
    nextId: 1,
  };

  const ops: Op[] = [
    { op: "add_slide", slide: { title: "Q3 Product Roadmap", layout: "title", background: { color: INK } } },
    { op: "add_slide", slide: { title: "Q3 Highlights", layout: "content" } },
    { op: "add_slide", slide: { title: "Revenue by Quarter", layout: "chart-forward" } },
    { op: "add_slide", slide: { title: "Plan Comparison", layout: "comparison" } },
    { op: "add_slide", slide: { title: "Next Steps", layout: "content" } },

    add("s1", text("title", ["Q3 Product Roadmap"], { x: 160, y: 300, w: 1280, h: 160 }, { fontSize: 88, bold: true, align: "center", color: "#ffffff" })),
    add("s1", text("subtitle", ["Planning review · October 2026"], { x: 160, y: 470, w: 1280, h: 60 }, { fontSize: 32, align: "center", color: "#cbd5e1" })),
    add("s1", { type: "shape", box: { x: 720, y: 570, w: 160, h: 8 }, shape: { kind: "rect", fill: "#6366f1" } }),

    add("s2", contentTitle("Q3 Highlights")),
    add(
      "s2",
      text(
        "bullets",
        [
          "Shipped the new onboarding flow to 100% of users",
          "Self-serve upgrades grew 38% quarter over quarter",
          "Launched the public API beta with 120 partners",
          "Cut median page load time from 2.1s to 1.2s",
        ],
        { x: 80, y: 220, w: 780, h: 600 },
      ),
    ),
    add("s2", {
      type: "image",
      box: { x: 920, y: 220, w: 600, h: 600 },
      image: { src: "https://picsum.photos/seed/roadmap/800/800", alt: "Team planning session", fit: "cover" },
    }),

    add("s3", contentTitle("Revenue by Quarter")),
    add("s3", {
      type: "chart",
      box: { x: 80, y: 220, w: 1440, h: 620 },
      chart: {
        kind: "bar",
        title: "Revenue ($M)",
        categories: ["Q1", "Q2", "Q3", "Q4"],
        series: [
          { name: "2025", data: [1.2, 1.5, 1.9, 2.4] },
          { name: "2026", data: [1.6, 2.1, 2.6, 3.1] },
        ],
        showLegend: true,
        xLabel: "Quarter",
        yLabel: "$M",
      },
    }),

    add("s4", contentTitle("Plan Comparison")),
    add("s4", {
      type: "table",
      box: { x: 80, y: 220, w: 1440, h: 520 },
      table: {
        headerRow: true,
        rows: [
          ["Feature", "Starter", "Pro", "Enterprise"],
          ["Seats", "5", "50", "Unlimited"],
          ["API access", "—", "Beta", "Full"],
          ["Support", "Email", "Priority", "Dedicated"],
        ],
      },
    }),

    add("s5", contentTitle("Next Steps")),
    add(
      "s5",
      text(
        "bullets",
        ["Finalize Q4 pricing changes by Nov 15", "Expand API beta to 500 partners", "Hire two platform engineers"],
        { x: 80, y: 220, w: 960, h: 500 },
      ),
    ),
    add("s5", { type: "shape", box: { x: 1160, y: 260, w: 320, h: 320 }, shape: { kind: "ellipse", fill: "#e0e7ff" } }),
  ];

  const { deck, results } = applyOpsToDeck(empty, ops);
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) throw new Error(`Sample deck failed to build: ${failed.error}`);
  return deck;
}
