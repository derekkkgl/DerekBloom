// Plain data (no "use client"), so server-rendered HELP can read it.

/** Every keyboard shortcut, as HELP lists them. Keep in step with lib/hotkeys.ts and CommandPalette's key handling. */
export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["⌘K", "Ctrl+K", "/"], action: "Open Look up from anywhere" },
  { keys: ["Enter"], action: "Run the highlighted command" },
  { keys: ["↑", "↓"], action: "Move through the suggestions" },
  { keys: ["↑"], action: "In an empty box: step back through recent commands" },
  { keys: ["Esc"], action: "Close Look up" },
  { keys: ["Tab"], action: "Move between links, rows, and buttons on a page" },
];
