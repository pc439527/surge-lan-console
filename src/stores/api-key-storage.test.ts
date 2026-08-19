import { beforeEach, describe, expect, it } from "vitest";
import { clearApiKey, isApiKeyRemembered, loadApiKey, saveApiKey } from "./api-key-storage";

describe("api-key-storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores key in sessionStorage by default", () => {
    saveApiKey("c1", "secret", false);
    expect(sessionStorage.getItem("surge-lan-console.key.session.c1")).toBe("secret");
    expect(localStorage.getItem("surge-lan-console.key.local.c1")).toBeNull();
  });

  it("stores key in localStorage when remember is on", () => {
    saveApiKey("c1", "secret", true);
    expect(localStorage.getItem("surge-lan-console.key.local.c1")).toBe("secret");
    expect(sessionStorage.getItem("surge-lan-console.key.session.c1")).toBeNull();
  });

  it("loads key from either storage", () => {
    saveApiKey("c1", "session-key", false);
    expect(loadApiKey("c1")).toBe("session-key");
    saveApiKey("c1", "local-key", true);
    expect(loadApiKey("c1")).toBe("local-key");
  });

  it("remembers flag reflects localStorage", () => {
    saveApiKey("c1", "secret", true);
    expect(isApiKeyRemembered("c1")).toBe(true);
    saveApiKey("c1", "secret", false);
    expect(isApiKeyRemembered("c1")).toBe(false);
  });

  it("clears key from both storages", () => {
    saveApiKey("c1", "a", false);
    saveApiKey("c1", "b", true);
    clearApiKey("c1");
    expect(loadApiKey("c1")).toBeNull();
  });
});
