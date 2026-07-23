import { describe, expect, it } from "vitest";
import { buildContent } from "../../packages/video-gen/src/content.js";

describe("video-gen content builder", () => {
  it("builds text-only content", () => {
    expect(buildContent({ prompt: "hello" })).toEqual([{ type: "text", text: "hello" }]);
  });

  it("rejects pure audio", () => {
    expect(() => buildContent({ prompt: "", refAudios: ["https://cdn.example/a.mp3"] })).toThrow(
      /Pure audio/,
    );
  });

  it("rejects text + audio only", () => {
    expect(() => buildContent({ prompt: "hi", refAudios: ["https://cdn.example/a.mp3"] })).toThrow(
      /Text \+ audio/,
    );
  });

  it("rejects last-frame without first-frame", () => {
    expect(() => buildContent({ prompt: "x", lastFrame: "https://cdn.example/l.png" })).toThrow(
      /--last-frame requires --first-frame/,
    );
  });

  it("enforces ref image limit", () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://cdn.example/${i}.png`);
    expect(() => buildContent({ prompt: "x", refImages: urls })).toThrow(/Too many --ref-image/);
  });
});
