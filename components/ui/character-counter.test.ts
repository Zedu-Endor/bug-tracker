import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CharacterCounter,
  characterCountTone,
} from "./character-counter";

describe("characterCountTone", () => {
  it("stays neutral until the last tenth of the limit", () => {
    expect(characterCountTone(0, 200)).toBe("normal");
    expect(characterCountTone(179, 200)).toBe("normal");
  });

  it("warns within the last tenth of the limit", () => {
    expect(characterCountTone(180, 200)).toBe("warn");
    expect(characterCountTone(199, 200)).toBe("warn");
  });

  it("is red at and beyond the limit", () => {
    expect(characterCountTone(200, 200)).toBe("limit");
    expect(characterCountTone(201, 200)).toBe("limit");
  });

  it("scales to each field's own limit", () => {
    expect(characterCountTone(4499, 5000)).toBe("normal");
    expect(characterCountTone(4500, 5000)).toBe("warn");
    expect(characterCountTone(2000, 2000)).toBe("limit");
  });
});

describe("CharacterCounter", () => {
  it("shows current/max and announces changes politely", () => {
    const html = renderToStaticMarkup(
      createElement(CharacterCounter, { length: 42, max: 200 }),
    );
    expect(html).toContain("42/200");
    expect(html).toContain('aria-live="polite"');
  });

  it("uses the neutral tone away from the limit", () => {
    const html = renderToStaticMarkup(
      createElement(CharacterCounter, { length: 10, max: 200 }),
    );
    expect(html).toContain("tabular-nums text-slate-500");
    expect(html).not.toContain("text-amber-700");
    expect(html).not.toContain("text-red-600");
  });

  it("turns amber near the limit and red at the limit", () => {
    const amber = renderToStaticMarkup(
      createElement(CharacterCounter, { length: 185, max: 200 }),
    );
    expect(amber).toContain("text-amber-700");

    const red = renderToStaticMarkup(
      createElement(CharacterCounter, { length: 200, max: 200 }),
    );
    expect(red).toContain("text-red-600");
  });
});
