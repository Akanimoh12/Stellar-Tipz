import React, { useEffect, useRef, useState } from "react";

// Live region priority levels
export type LiveRegionPriority = "polite" | "assertive";

// Creates a live region element that can be used to announce changes to screen readers
// Usage: const announce = useLiveRegion();
// announce("Message to announce");
export function useLiveRegion() {
  const [elementRef, setElementRef] = useRef<HTMLDivElement>(null);
  const [priority, setPriority] = useState<LiveRegionPriority>("polite");

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    // Set initial aria-live attributes
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", priority);
    element.setAttribute("aria-atomic", "true");

    // Clean up on unmount
    return () => {
      element.removeAttribute("role");
      element.removeAttribute("aria-live");
      element.removeAttribute("aria-atomic");
    };
  }, [priority]);

  // Function to announce a message
  const announce = (message: string, priority?: LiveRegionPriority) => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    const effectivePriority = priority || "polite";

    // Update the priority if changed
    if (effectivePriority !== priority) {
      setPriority(effectivePriority);
    }

    // Clear previous content and announce new message
    element.textContent = "";
    // Force a re-render by setting textContent and using setTimeout
    // This ensures the screen reader announces the message
    setTimeout(() => {
      element.textContent = message;
    }, 0);
  };

  return { announce, elementRef: setElementRef, priority, setPriority };
}

// Announce a message to screen readers with the specified priority
// polite: announcements are announced when the user is idle (default)
// assertive: announcements interrupt the user (use for errors and important updates)
export function announce(
  message: string,
  priority: LiveRegionPriority = "polite"
): void {
  // Create a temporary live region element if one doesn't exist
  const container = document.getElementById("sr-only-live-region-container");

  if (!container) {
    const div = document.createElement("div");
    div.setAttribute("role", "status");
    div.setAttribute("aria-live", priority);
    div.setAttribute("aria-atomic", "true");
    div.setAttribute("className", "sr-only");
    div.id = "sr-only-live-region-container";
    document.body.appendChild(div);
  }

  // Clear and announce
  const containerEl = document.getElementById("sr-only-live-region-container")!;
  containerEl.textContent = "";
  setTimeout(() => {
    containerEl.textContent = message;
  }, 10);
}

export default useLiveRegion;