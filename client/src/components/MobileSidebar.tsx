import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

/**
 * MobileMenuButton
 *
 * A hamburger button visible only on small screens (< md breakpoint).
 * Dispatches "ultra:toggle-mobile-sidebar" to open/close the mobile sidebar overlay.
 */
export function MobileMenuButton(): JSX.Element {
  function handleClick() {
    window.dispatchEvent(new CustomEvent("ultra:toggle-mobile-sidebar"));
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden flex-shrink-0"
      onClick={handleClick}
      aria-label="Open navigation menu"
      data-testid="button-mobile-menu"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}

/**
 * MobileSidebar
 *
 * A slide-over overlay sidebar using shadcn Sheet (side="left").
 * Visible only on small screens — hidden at md: and above.
 * Responds to "ultra:toggle-mobile-sidebar" events.
 * Auto-closes on route change.
 */
export function MobileSidebar({ children }: { children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  // Close when route changes (user navigated)
  useEffect(() => {
    setOpen(false);
  }, [location]);

  // Listen for toggle events dispatched by MobileMenuButton or keyboard shortcuts
  useEffect(() => {
    function handleToggle() {
      setOpen(prev => !prev);
    }

    window.addEventListener("ultra:toggle-mobile-sidebar", handleToggle);
    return () => {
      window.removeEventListener("ultra:toggle-mobile-sidebar", handleToggle);
    };
  }, []);

  return (
    // The Sheet itself is always in the DOM so it can handle events,
    // but we only render it visually on small screens.
    <div className="md:hidden" data-testid="mobile-sidebar-wrapper">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="p-0 w-72 flex flex-col"
          data-testid="mobile-sidebar-content"
        >
          {/* Accessible title for screen readers */}
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>

          {/* Render sidebar content (same nav tree as the desktop sidebar) */}
          <div className="flex-1 overflow-y-auto">{children}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
