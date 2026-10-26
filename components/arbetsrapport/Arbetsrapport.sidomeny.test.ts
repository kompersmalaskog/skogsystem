import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Sidomeny från 1000 px (Del 2, 2026-10-25). Bara CSS: telefon och iPad stående får flikraden som förut.
const src = readFileSync("components/arbetsrapport/Arbetsrapport.tsx", "utf8");
const block = src.slice(src.indexOf("const SIDOMENY_FRAN_PX"), src.indexOf("const css = `"));

describe("Arbetsrapport: sidomeny på stor skärm", () => {
  it("flikraden bär klasserna och sidomenyns CSS ligger i vyns css (före den, annars TDZ)", () => {
    expect(src).toContain('className="ar-nav"');
    expect(src).toContain('className="ar-nav-knapp" aria-current={aktiv===n.key?"page":undefined}');
    expect(src).toContain('className="ar-nav-text"');
    expect(src).toMatch(/const css = `[\s\S]*\$\{SIDOMENY_CSS\}/);
    expect(src.indexOf("const SIDOMENY_CSS")).toBeLessThan(src.indexOf("const css = `"));
  });
  it("bara inom media-frågan från 1000 px, och innehållet flyttas åt höger lika mycket som menyn är bred", () => {
    expect(block).toContain("const SIDOMENY_FRAN_PX = 1000;");
    expect(block).toContain("@media (min-width: ${SIDOMENY_FRAN_PX}px)");
    // !important: rotlayouten har <body style={{padding:0}}> inline, som annars vinner — då flyttades innehållet aldrig.
    expect(block).toContain("body:has(.ar-nav) { padding-left: ${SIDOMENY_BREDD_PX}px !important; }");
    expect(block).toContain("width: ${SIDOMENY_BREDD_PX}px !important");
  });
  it("inga citattecken i selektorerna (React escapar dem i <style>)", () => {
    const css = block.slice(block.indexOf("@media"), block.lastIndexOf("`"));
    expect(css).not.toMatch(/["']/);
  });

  it("rotlayoutens <body> har padding inline — därför MÅSTE sidomenyns padding ha !important (annars ligger menyn ovanpå)", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    if (/<body[^>]*style=\{\{[^}]*padding/.test(layout)) expect(block).toMatch(/padding-left: \$\{SIDOMENY_BREDD_PX\}px !important/);
  });
});
