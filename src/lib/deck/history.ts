import { applyPatches, type Patch } from "immer";
import type { Deck } from "./schema";

export const HISTORY_LIMIT = 100;

export type TxnMeta = { source: "user" | "ai"; label: string; txnId?: string };

export type Txn = {
  id: string;
  label: string;
  source: "user" | "ai";
  patches: Patch[];
  inversePatches: Patch[];
};

export function recordTxn(past: Txn[], meta: TxnMeta, patches: Patch[], inversePatches: Patch[]): Txn[] {
  if (patches.length === 0) return past;
  const last = past.at(-1);
  if (meta.txnId && last?.id === meta.txnId) {
    const merged: Txn = {
      ...last,
      patches: [...last.patches, ...patches],
      inversePatches: [...inversePatches, ...last.inversePatches],
    };
    return [...past.slice(0, -1), merged];
  }
  const txn: Txn = {
    id: meta.txnId ?? crypto.randomUUID(),
    label: meta.label,
    source: meta.source,
    patches,
    inversePatches,
  };
  return [...past, txn].slice(-HISTORY_LIMIT);
}

export const undoTxn = (deck: Deck, txn: Txn): Deck => applyPatches(deck, txn.inversePatches);
export const redoTxn = (deck: Deck, txn: Txn): Deck => applyPatches(deck, txn.patches);
