import { DeckSchema } from "./schema";
import { useDeckStore } from "./store";

const DB_NAME = "ai-presentation-builder";
const STORE = "kv";
const DECK_KEY = "deck";
const BACKUP_KEY = "deck-backup";
const SAVE_DELAY_MS = 300;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadSavedDeck(): Promise<void> {
  const saved: unknown = await run("readonly", (store) => store.get(DECK_KEY));
  if (saved === undefined) return;
  const parsed = DeckSchema.safeParse(saved);
  if (parsed.success) {
    useDeckStore.getState().replaceDeck(parsed.data);
    return;
  }
  console.warn("Saved deck failed validation; starting fresh. Raw copy kept under", BACKUP_KEY, parsed.error);
  await run("readwrite", (store) => store.put(saved, BACKUP_KEY));
}

function startAutosave(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  useDeckStore.subscribe((state, prev) => {
    if (state.deck === prev.deck) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      run("readwrite", (store) => store.put(useDeckStore.getState().deck, DECK_KEY)).catch((error) =>
        console.warn("Autosave failed", error),
      );
    }, SAVE_DELAY_MS);
  });
}

let restoring: Promise<void> | undefined;

export function restoreDeck(): Promise<void> {
  restoring ??= loadSavedDeck()
    .catch((error) => console.warn("Could not load the saved deck", error))
    .then(startAutosave);
  return restoring;
}
