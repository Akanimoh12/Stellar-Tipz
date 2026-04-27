import { describe, it, expect, beforeEach } from "vitest";

import { useToastStore } from "../toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    useToastStore.setState({
      visibleToasts: [],
      queuedToasts: [],
      maxVisible: 1,
      position: "bottom-right",
    });
  });

  it("adds toast with auto-generated id", () => {
    const store = useToastStore.getState();
    const id = store.addToast({ message: "Hello", type: "success" });

    expect(id).toBeTruthy();
    expect(useToastStore.getState().visibleToasts).toHaveLength(1);
    expect(useToastStore.getState().visibleToasts[0].id).toBe(id);
  });

  it("queues extra toasts when max visible is reached", () => {
    const store = useToastStore.getState();
    store.addToast({ message: "First", type: "success" });
    store.addToast({ message: "Second", type: "info" });

    expect(useToastStore.getState().visibleToasts).toHaveLength(1);
    expect(useToastStore.getState().queuedToasts).toHaveLength(1);
  });

  it("removes toast by id", () => {
    const store = useToastStore.getState();
    const id = store.addToast({ message: "Hello", type: "success" });

    store.removeToast(id);

    expect(useToastStore.getState().visibleToasts).toHaveLength(0);
  });

  it("clears all toasts", () => {
    const store = useToastStore.getState();
    store.addToast({ message: "Hello", type: "success" });
    store.clearAll();

    expect(useToastStore.getState().visibleToasts).toHaveLength(0);
    expect(useToastStore.getState().queuedToasts).toHaveLength(0);
  });
});
