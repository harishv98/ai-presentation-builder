"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return mounted ? children : fallback;
}
