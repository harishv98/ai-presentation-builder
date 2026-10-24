import { useDeckStore } from "@/lib/deck/store";
import { generateDeck } from "./generateDeck";
import { runAgent } from "./runAgent";

export function sendPrompt(prompt: string): Promise<void> {
  return useDeckStore.getState().deck.slideOrder.length === 0 ? generateDeck(prompt) : runAgent(prompt);
}
