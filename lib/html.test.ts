import { describe, it, expect } from "vitest";
import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("escapar de tecken som öppnar taggar och attribut", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&\``)).toBe("&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;&#96;");
  });
  it("null/undefined blir tom text, siffror blir text", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(12)).toBe("12");
  });
  it("vanlig text och svenska tecken rörs inte", () => {
    expect(escapeHtml("Östra-Höka åäö 1:5 (12 m³)")).toBe("Östra-Höka åäö 1:5 (12 m³)");
  });
});
