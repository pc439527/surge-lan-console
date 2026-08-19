import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, resolveTheme } from "./theme";

describe("theme", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    delete document.documentElement.dataset.theme;
  });

  it("resolves explicit themes", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves system theme from media query", () => {
    expect(resolveTheme("system")).toMatch(/^light|dark$/);
  });

  it("applies dark theme to the document root", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies light theme to the document root", () => {
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
