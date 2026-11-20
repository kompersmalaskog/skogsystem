// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, afterEach } from "vitest";
import TimmarGraf, { type GrafDag, type GrafManad } from "./TimmarGraf";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let cont: HTMLDivElement;
afterEach(() => { cont?.remove(); });

const vecka = (h: number[]): GrafDag[] => ["mån", "tis", "ons", "tor", "fre", "lör", "sön"].map((e, i) => ({ datum: `2026-10-${12 + i}`, etikett: e, h: h[i] ?? 0, idag: i === 6 }));
const ar: GrafManad[] = ["jan", "feb"].map((n, i) => ({ namn: n, h: 100 + i, schemaH: 160, framtid: false, aktuell: i === 1 }));

async function rita(v: GrafDag[]) {
  cont = document.createElement("div"); document.body.appendChild(cont);
  await act(async () => { createRoot(cont).render(<TimmarGraf vecka={v} ar={ar} />); });
}

describe("Min tid: diagrammet i ett kort (2026-10-25)", () => {
  it("Vecka/År sitter INNE i diagramkortet och är smal — ingen andra flikrad över hela bredden", async () => {
    await rita(vecka([0, 0, 4.35, 0, 8.45]));
    const kort = cont.querySelector<HTMLElement>("[data-timmar-graf]")!;
    const val = kort.querySelector<HTMLElement>("[role='tablist']")!;
    expect(val).not.toBeNull();
    expect(val.style.maxWidth).toBe("220px");
    expect(Array.from(val.querySelectorAll("[role='tab']")).map(b => b.textContent)).toEqual(["Vecka", "År"]);
    expect(kort.textContent).not.toContain("Inget jobbat");
  });
  it("en vecka utan timmar: en mening i stället för sju tomma streck; År visar ändå staplarna", async () => {
    await rita(vecka([]));
    expect(cont.querySelector("[data-tom-vecka]")?.textContent).toContain("Inget jobbat den här veckan än.");
    await act(async () => { cont.querySelectorAll<HTMLButtonElement>("[role='tab']")[1].click(); });
    expect(cont.querySelector("[data-tom-vecka]")).toBeNull();
    expect(cont.textContent).toContain("feb");
  });
});
