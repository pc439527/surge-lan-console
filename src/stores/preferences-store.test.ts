import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY, usePreferencesStore } from "./preferences-store";

describe("preferences-store", () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferencesStore.setState({ appearance: "system", demoMode: false });
  });

  it("defaults to system appearance", () => {
    expect(usePreferencesStore.getState().appearance).toBe("system");
  });

  it("sets appearance", () => {
    usePreferencesStore.getState().setAppearance("dark");
    expect(usePreferencesStore.getState().appearance).toBe("dark");
  });

  it("persists appearance to localStorage", () => {
    usePreferencesStore.getState().setAppearance("light");
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.appearance).toBe("light");
  });
});