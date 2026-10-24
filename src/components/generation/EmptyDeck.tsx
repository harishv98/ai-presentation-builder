"use client";

import { useState } from "react";
import { generateDeck } from "@/lib/agent/generateDeck";
import { MAX_PROMPT_CHARS } from "@/lib/agent/protocol";
import { selectAwaitingPlanAnswer, selectRunning, useChatStore } from "@/lib/chat/store";
import { addBlankSlide, loadSampleDeck } from "@/lib/slides/actions";

const EXAMPLES = [
  "A 6-slide deck on our Q3 product roadmap, with a revenue chart and a feature comparison table",
  "A 5-slide pitch for a neighborhood coffee subscription",
  "Explain how solar panels work to high school students in 5 slides",
];

export function EmptyDeck() {
  const [prompt, setPrompt] = useState("");
  const running = useChatStore(selectRunning);
  const awaitingAnswer = useChatStore(selectAwaitingPlanAnswer);

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
          {awaitingAnswer
            ? `Answer the questions in chat, or say "go ahead" and the AI fills in the gaps.`
            : "Describe the deck you want. The AI outlines the slides, then fills each one. Everything stays editable."}
        </p>
        <textarea
          id="deck-prompt"
          aria-label="Describe your presentation"
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
