"use client";

import { useEffect, useRef } from "react";

/** True when the user is typing in a field, so single-key shortcuts like "/" must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Cmd+K, Ctrl+K, or "/" (when not already typing) opens the command palette. */
export function isPaletteShortcut(e: KeyboardEvent): boolean {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") return true;
  return e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
}

/** Listen for keydown on the whole page for the component's lifetime. */
export function useGlobalKeydown(handler: (e: KeyboardEvent) => void): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => latest.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
