import { create } from "zustand";
import { createEmptyDeck } from "./fixture";
import { recordTxn, redoTxn, undoTxn, type Txn, type TxnMeta } from "./history";
import { applyOpsToDeck, type Op, type OpResult } from "./ops";
import type { Deck } from "./schema";

type DeckState = {
  deck: Deck;
  past: Txn[];
  future: Txn[];
  replaceDeck: (deck: Deck) => void;
  applyOps: (ops: Op[], meta: TxnMeta) => OpResult[];
  undo: () => void;
  redo: () => void;
};

export const useDeckStore = create<DeckState>()((set, get) => ({
  deck: createEmptyDeck(),
  past: [],
  future: [],

  replaceDeck(deck) {
    set({ deck, past: [], future: [] });
  },

  applyOps(ops, meta) {
    const { deck, results, patches, inversePatches } = applyOpsToDeck(get().deck, ops);
    if (patches.length > 0) {
      set((s) => ({ deck, past: recordTxn(s.past, meta, patches, inversePatches), future: [] }));
    }
    return results;
  },

  undo() {
    const { past, future, deck } = get();
    const txn = past.at(-1);
    if (!txn) return;
    set({ deck: undoTxn(deck, txn), past: past.slice(0, -1), future: [...future, txn] });
  },

  redo() {
    const { past, future, deck } = get();
    const txn = future.at(-1);
    if (!txn) return;
    set({ deck: redoTxn(deck, txn), past: [...past, txn], future: future.slice(0, -1) });
  },
}));

declare global {
  interface Window {
    deckStore?: typeof useDeckStore;
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.deckStore = useDeckStore;
}
