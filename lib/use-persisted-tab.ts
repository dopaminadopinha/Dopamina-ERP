"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function usePersistedTab<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const saved = window.localStorage.getItem(key) as T | null;
      return saved && allowed.includes(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try { window.localStorage.setItem(key, value); } catch { /* Storage may be blocked by the browser. */ }
  }, [key, value]);

  return [value, setValue];
}
