import { describe, it, expect, vi } from "vitest";
import { createElement, Suspense, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { lazyPage } from "../src/renderer/lazyPage";
import { Dashboard, GameTheater, Library, PlayMode, SetupWizard, pageForHash } from "../src/renderer/pageRegistry";

const Hello: ComponentType<{ name: string }> = ({ name }) => createElement("p", null, `hello ${name}`);

function render(Page: ComponentType<{ name: string }>): string {
  return renderToString(
    createElement(Suspense, { fallback: createElement("i", null, "loading") }, createElement(Page, { name: "magi" })),
  );
}

describe("lazyPage", () => {
  it("renders the page directly, with no Suspense fallback, once it has been preloaded", async () => {
    const Page = lazyPage(async () => Hello);
    await Page.preload();
    const html = render(Page);
    expect(html).toContain("hello");
    expect(html).toContain("magi");
    expect(html).not.toContain("loading");
  });

  it("falls back to Suspense when the page has not been preloaded", () => {
    const Page = lazyPage(async () => Hello);
    const html = render(Page);
    expect(html).toContain("loading");
    expect(html).not.toContain("hello");
  });

  it("loads the chunk once however many times preload is called", async () => {
    const load = vi.fn(async () => Hello);
    const Page = lazyPage(load);
    await Promise.all([Page.preload(), Page.preload()]);
    await Page.preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never rejects on a failed preload and retries on the next call", async () => {
    const load = vi
      .fn<() => Promise<ComponentType<{ name: string }>>>()
      .mockRejectedValueOnce(new Error("chunk missing"))
      .mockResolvedValue(Hello);
    const Page = lazyPage(load);
    await expect(Page.preload()).resolves.toBeUndefined();
    // The failure left nothing loaded, so rendering still suspends rather than crashing.
    await Page.preload();
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(render(Page)).toContain("hello");
  });
});

describe("pageForHash", () => {
  it("maps the launch location to the page it will render", () => {
    expect(pageForHash("")).toBe(Dashboard);
    expect(pageForHash("#/")).toBe(Dashboard);
    expect(pageForHash("#/dashboard")).toBe(Dashboard);
    expect(pageForHash("#/library")).toBe(Library);
    expect(pageForHash("#/library?q=fox")).toBe(Library);
    expect(pageForHash("#/game/12")).toBe(GameTheater);
    expect(pageForHash("#/play")).toBe(PlayMode);
    expect(pageForHash("#/overlay")).toBe(PlayMode);
    expect(pageForHash("#/setup")).toBe(SetupWizard);
  });

  it("falls back to the dashboard for a path with no page", () => {
    expect(pageForHash("#/nope")).toBe(Dashboard);
    expect(pageForHash("#/games")).toBe(Dashboard);
  });
});
