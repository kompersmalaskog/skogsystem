// @vitest-environment jsdom
/**
 * RadGrupp: länkrader i ETT kort. Linje mellan raderna, ingen efter den sista; hela raden är tryckytan; fragment och falska barn klaras.
 * Låser felet där `border: 'none'` efter `...RAD` nollade linjen på varje rad (nyckelordningen i style-objektet).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { RadGrupp, RadLank } from "./RadGrupp";

let root: Root | null = null;
let cont: HTMLDivElement;
async function monter(el: React.ReactElement) {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cont = document.createElement("div"); document.body.appendChild(cont);
  root = createRoot(cont);
  await act(async () => { root!.render(el); });
}
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); root = null; });

const rader = () => Array.from(cont.firstElementChild!.children) as HTMLElement[];

describe("RadGrupp", () => {
  it("linje under varje rad utom den sista, och raderna bär sidopaddingen (kortet har ingen)", async () => {
    await monter(<RadGrupp><RadLank text="Veckor" onClick={() => {}} /><RadLank text="Per bolag" onClick={() => {}} /></RadGrupp>);
    const r = rader();
    expect(r).toHaveLength(2);
    expect(r[0].style.borderBottomStyle).toBe("solid");
    expect(r[1].style.borderBottomStyle).not.toBe("solid");
    expect(r[0].style.padding).toBe("12px 16px");
    expect((cont.firstElementChild as HTMLElement).style.padding).toMatch(/^0(px)?$/);
  });
  it("fragment och falska barn: sista RIKTIGA raden saknar linje", async () => {
    const visa = false;
    await monter(<RadGrupp><RadLank text="A" onClick={() => {}} /><>{<RadLank text="B" onClick={() => {}} />}{visa && <RadLank text="C" onClick={() => {}} />}</></RadGrupp>);
    const r = rader();
    expect(r.map((x) => x.textContent)).toEqual(["Achevron_right", "Bchevron_right"]);
    expect(r[0].style.borderBottomStyle).toBe("solid");
    expect(r[1].style.borderBottomStyle).not.toBe("solid");
  });
  it("hela raden är tryckytan: onClick → knapp, href → länk, minst 44 px, chevron i text3", async () => {
    const klick = vi.fn();
    await monter(<RadGrupp><RadLank text="Knapp" onClick={klick} /><RadLank text="Länk" href="/x" /></RadGrupp>);
    const [k, l] = rader();
    expect(k.tagName).toBe("BUTTON");
    expect(l.tagName).toBe("A");
    expect(k.style.width).toBe("100%");
    expect(k.style.minHeight).toBe("44px");
    await act(async () => { k.click(); });
    expect(klick).toHaveBeenCalledTimes(1);
    expect((k.querySelector(".material-symbols-outlined") as HTMLElement).style.color).toBe("rgb(99, 99, 102)");
  });
  it("utanför en grupp (t.ex. i ett kort med egen sidopadding) bär raden ingen sidopadding", async () => {
    await monter(<div><RadLank text="Ensam" onClick={() => {}} sista /></div>);
    expect((cont.firstElementChild!.firstElementChild as HTMLElement).style.padding).toBe("12px 0px");
  });
});
