import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Lön-vyn hade 32 px luft under sista knappen medan flikraden är 80 px hög:
// "Godkänn och skicka" låg bakom flikraden (Martin 2026-10-25). Varje <main> i en vy
// som ritar bottenfältet ska sluta med SCROLL_BOTTOM.
describe("Arbetsrapport: inget hamnar under flikraden", () => {
  it("ingen <main> slutar med bara AVSTAND.xxl i botten", () => {
    const src = readFileSync("components/arbetsrapport/Arbetsrapport.tsx", "utf8");
    expect(src).not.toMatch(/<main style=\{\{ padding:`\$\{AVSTAND\.l\}px \$\{AVSTAND\.l\}px \$\{AVSTAND\.xxl\}px`/);
    const lon = src.match(/<main style=\{\{ padding:`\$\{AVSTAND\.l\}px \$\{AVSTAND\.l\}px \$\{SCROLL_BOTTOM\}`/g) ?? [];
    expect(lon.length).toBe(2);
  });
});
