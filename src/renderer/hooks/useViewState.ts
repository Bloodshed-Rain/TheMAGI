import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

// Session-only view state: never persist replay metadata or drafts to disk.
const views = new Map<string, unknown>();
export function useViewState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    views.has(key) ? views.get(key) as T : typeof initial === "function" ? (initial as () => T)() : initial,
  );
  useEffect(() => { views.set(key, value); }, [key, value]);
  return [value, setValue];
}
