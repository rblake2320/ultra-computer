import { useEffect } from "react";

/**
 * useKeyboardShortcuts
 *
 * Registers global keyboard shortcuts via a document-level keydown listener.
 * Communicates via CustomEvents so any component can react without prop-drilling.
 *
 * Shortcuts:
 *   Cmd/Ctrl+K        → "ultra:focus-search"
 *   Cmd/Ctrl+N        → "ultra:new-session"
 *   Cmd/Ctrl+Shift+S  → "ultra:navigate" (path: /settings)
 *   Cmd/Ctrl+/        → "ultra:toggle-sidebar"
 *   Escape            → "ultra:close-panel"
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K — Focus search/command input
      if (isMod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("ultra:focus-search"));
        return;
      }

      // Cmd/Ctrl+N — Create new session
      if (isMod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("ultra:new-session"));
        return;
      }

      // Cmd/Ctrl+Shift+S — Open settings
      if (isMod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("ultra:navigate", { detail: { path: "/settings" } })
        );
        return;
      }

      // Cmd/Ctrl+/ — Toggle sidebar collapse
      if (isMod && !e.shiftKey && !e.altKey && e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("ultra:toggle-sidebar"));
        return;
      }

      // Escape — Close any open dialog/panel
      if (!isMod && !e.shiftKey && !e.altKey && e.key === "Escape") {
        // Don't prevent default — browsers use Escape to close native dialogs too.
        // We dispatch our own event for custom panels, but don't block native behavior.
        window.dispatchEvent(new CustomEvent("ultra:close-panel"));
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
