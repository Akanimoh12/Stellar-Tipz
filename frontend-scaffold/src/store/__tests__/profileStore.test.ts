import { describe, it, expect, beforeEach } from "vitest";

import { useProfileStore } from "../profileStore";

describe("profileStore", () => {
  beforeEach(() => {
    useProfileStore.setState({
      profile: null,
      loading: false,
      error: null,
    });
  });

  it("sets profile and clears loading state", () => {
    useProfileStore.getState().setLoading(true);
    useProfileStore.getState().setError("old error");
    useProfileStore.getState().setProfile({
      owner: "GA123",
      username: "alice",
      displayName: "Alice",
      bio: "",
      imageUrl: "",
      xHandle: "@alice",
      xFollowers: 0,
      xEngagementAvg: 0,
      creditScore: 40,
      totalTipsReceived: "0",
      totalTipsCount: 0,
      balance: "0",
      registeredAt: 0,
      updatedAt: 0,
    });

    expect(useProfileStore.getState().profile?.username).toBe("alice");
    expect(useProfileStore.getState().loading).toBe(false);
    expect(useProfileStore.getState().error).toBeNull();
  });

  it("clears profile and resets loading state", () => {
    useProfileStore.getState().setProfile({
      owner: "GA123",
      username: "alice",
      displayName: "Alice",
      bio: "",
      imageUrl: "",
      xHandle: "@alice",
      xFollowers: 0,
      xEngagementAvg: 0,
      creditScore: 40,
      totalTipsReceived: "0",
      totalTipsCount: 0,
      balance: "0",
      registeredAt: 0,
      updatedAt: 0,
    });

    useProfileStore.getState().clearProfile();

    expect(useProfileStore.getState().profile).toBeNull();
    expect(useProfileStore.getState().loading).toBe(false);
  });

  it("updates loading state", () => {
    useProfileStore.getState().setLoading(true);

    expect(useProfileStore.getState().loading).toBe(true);
  });
});
