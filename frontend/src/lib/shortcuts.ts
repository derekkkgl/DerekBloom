// Plain data (no "use client"), so server-rendered HELP can read it.

/** Every keyboard shortcut, as HELP lists them. Keep in step with lib/hotkeys.ts and CommandPalette's key handling. */
export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["⌘K", "Ctrl+K", "/"], action: "Open Look up from anywhere" },
  { keys: ["Enter"], action: "Run the highlighted command" },
  { keys: ["↑", "↓"], action: "Move through the suggestions" },
  { keys: ["↑"], action: "In an empty box: step back through recent commands" },
  { keys: ["Esc"], action: "Close Look up" },
  { keys: ["Tab"], action: "Move between links, rows, and buttons on a page" },
  { keys: ["↑", "↓", "Enter"], action: "In Look up or a ticker box: move through ticker suggestions and pick one" },
  { keys: ["↑", "↓"], action: "TXN: move between transactions (Tab to a row first)" },
  { keys: ["E"], action: "TXN: edit the selected transaction in place" },
  { keys: ["Delete"], action: "TXN: delete the selected transaction (asks first)" },
  { keys: ["Enter"], action: "TXN, PORT cash, GOAL and YLD numbers: save what you typed" },
  { keys: ["Esc"], action: "TXN: cancel an edit or a delete; in a number field, undo your typing" },
];
