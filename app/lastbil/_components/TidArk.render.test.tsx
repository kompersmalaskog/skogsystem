// @vitest-environment jsdom
// Tidsvyn säger alltid varför Spara inte går att trycka (Martin 2026-11-05: "knappen var nersläckt hela tiden").
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import TidArk from "./TidArk";
import type { TidForslag } from "@/lib/flytt/traillertid";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let el: HTMLDivElement | null = null;
afterEach(async () => { await act(async () => { rot?.unmount(); }); el?.remove(); rot = null; el = null; });

const FORSLAG: TidForslag = {
  lage: "ok", min: 373, fran: "2026-11-04T10:23:34Z", till: "2026-11-04T16:36:22Z",
  forst: true, medHem: true, lastningFore: false, varning: null,
};

async function rita(forslag: TidForslag | null | undefined, sparadMin: number | null) {
  if (!el) { el = document.createElement("div"); document.body.appendChild(el); rot = createRoot(el); }
  await act(async () => {
    rot!.render(<TidArk maskin="Giant" forslag={forslag} sparadMin={sparadMin} last={false} onSpara={async () => ({ ok: true } as any)} onStang={() => {}} />);
  });
}
const spara = () => document.querySelector("[data-tid-spara]") as HTMLButtonElement;
const tal = () => document.querySelector("[data-tid-tal]")!.textContent;

describe("TidArk: knappen förklarar sig", () => {
  it("förslaget läses när arket öppnas: 'Läser förslaget …', sedan fylls förslaget i och Spara går att trycka", async () => {
    await rita(undefined, null);
    expect(spara().textContent).toBe("Läser förslaget …");
    expect(spara().disabled).toBe(true);
    expect(tal()).toBe("Läser …");
    await rita(FORSLAG, null);
    expect(tal()).toBe("6 h 13 min");
    expect(spara().textContent).toBe("Spara 6 h 13 min");
    expect(spara().disabled).toBe(false);
  });

  it("sparad tid: knappen säger 'Sparad', och förslaget skriver aldrig över den", async () => {
    await rita(FORSLAG, 253);
    expect(tal()).toBe("4 h 13 min");
    expect(spara().textContent).toBe("checkSparad 4 h 13 min");
    expect(spara().disabled).toBe(true);
  });
});
