import { useCallback, useEffect, useRef, useState } from "react";

// Live region priority levels
export type LiveRegionPriority = "polite" | "assertive";

// Creates a live region element that can be used to announce changes to screen readers
// Usage: const { announce, elementRef } = useLiveRegion();
// <div ref={elementRef} ... /> + announce("Message to announce");
export function useLiveRegion() {
  const elementRef = useRef<HTMLDivElement>(null);
  const [priority, setPriority] = useState<LiveRegionPriority>("polite");

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", priority);
    element.setAttribute("aria-atomic", "true");

    return () => {
      element.removeAttribute("role");
      element.removeAttribute("aria-live");
      element.removeAttribute("aria-atomic");
    };
  }, [priority]);

  const announce = useCallback(
    (message: string, nextPriority?: LiveRegionPriority) => {
      const effectivePriority: LiveRegionPriority = nextPriority ?? "polite";

      if (effectivePriority !== priority) {
        setPriority(effectivePriority);
      }

      // If a bound element exists, update it directly; otherwise fall back
      // to the shared document-level live region so announcements still work.
      if (elementRef.current) {
        const element = elementRef.current;
        element.textContent = "";
        setTimeout(() => {
          // Guard against unmount between clear and announce.
          if (element.isConnected) {
            element.textContent = message;
          }
        }, 0);
        return;
      }

      announceGlobal(message, effectivePriority);
    },
    [priority],
  );

  return { announce, elementRef, priority, setPriority };
}

// Announce a message to screen readers with the specified priority
// polite: announcements are announced when the user is idle (default)
// assertive: announcements interrupt the user (use for errors and important updates)
export function announce(
  message: string,
  priority: LiveRegionPriority = "polite",
): void {
  announceGlobal(message, priority);
}

function announceGlobal(
  message: string,
  priority: LiveRegionPriority = "polite",
): void {
  if (typeof document === "undefined") return;
  // Create a temporary live region element if one doesn't exist
  let container = document.getElementById("sr-only-live-region-container");

  if (!container) {
    const div = document.createElement("div");
    div.setAttribute("role", "status");
    div.setAttribute("aria-live", priority);
    div.setAttribute("aria-atomic", "true");
    div.setAttribute("class", "sr-only");
    div.id = "sr-only-live-region-container";
    document.body.appendChild(div);
    container = div;
  } else if (container.getAttribute("aria-live") !== priority) {
    container.setAttribute("aria-live", priority);
  }

  // Clear and announce
  const containerEl = container;
  containerEl.textContent = "";
  setTimeout(() => {
    if (containerEl.isConnected) {
      containerEl.textContent = message;
    }
  }, 10);
}

export default useLiveRegion;