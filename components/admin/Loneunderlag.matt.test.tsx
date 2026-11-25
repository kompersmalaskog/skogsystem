// @vitest-environment jsdom
// MÄTT I RIKTIG CHROMIUM. jsdom räknar ingen layout: en förarrad som blir lägre än 44 px, ett "Påminn" som trycker ut raden i sidled
// eller en lång "Att kolla"-text som går utanför skärmen syns inte där. Listan (en rad per förare) och arkets "Att kolla" renderas i
// jsdom ur samma vymodell som Löneunderlaget (lib/admin/loneunderlagVy), HTML:en mäts i Playwright-Chromium.
// Hoppas över om det inte finns någon Chromium — det står i testnamnet. LONEUNDERLAG_SKRIV=<mapp> sparar bilderna.
import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FARG, FONT, TRAFFYTA } from "@/lib/design/tokens";
import { byggForarKort } from "@/lib/admin/loneunderlagVy";
import { ForarListRad, AttKolla } from "./ForarKortDelar";
import { Lista } from "./ui";
import { hittaChromium } from "../../lib/testStod/chromium";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const CHROMIUM = hittaChromium();
const SKARMAR = [{ w: 360, h: 740 }, { w: 390, h: 844 }, { w: 834, h: 1112 }, { w: 1440, h: 900 }];

const bas = (id: string, namn: string, extra: Record<string, any> = {}) => ({
  medarbetare_id: id, namn, status: "utkast", godkannande: "godkand", anstallningsnummer: "1001", synk: [], deldagar: [], ledighetskollision: [],
  rast_langa: [], kortpass: [], orimliga: [], helglon: { dagar: [] }, byten: [], obekraftade: 0, ob: { obesvarade: 0 }, varningar: [], ...extra,
});
// De längsta texterna appen kan ge: frånvaro att lägga in, tidsskillnad, deldag, rast med stopp, helglön, och ett namn som är långt.
const MAX = bas("m3", "Max Karlsson-Långnamnsson", {
  godkannande: "vantar",
  synk: [{ datum: "2026-10-16", diff_min: 27, bekraftat: "06:00-16:00 rast 30", maskinen: "06:27-16:00 rast 30" }],
  rast_langa: [{ datum: "2026-10-21", rast_min: 95, avbrott: [{ typ: "Övrigt", minuter: 40 }, { typ: "Övrigt", minuter: 25 }] }],
  deldagar: [{ datum: "2026-10-09", typ: "vab", fran_tid: "12:30", timmar: 3.5, arbetad_min: 270 }],
  helglon: { dagar: [{ datum: "2026-10-31", namn: "Allhelgonaafton", ger: false, skal: "tjanstledig_omger" }] },
  varningar: ["Frånvaro (semester): 5 dag(ar) 2026-10-12…2026-10-16 — löneart saknas, läggs inte som lönerad"],
});
const KORT = [
  byggForarKort(bas("m1", "Anna Berg")),
  byggForarKort(MAX),
  byggForarKort(bas("m4", "Oskar Nilsson", { anstallningsnummer: "", obekraftade: 2 })),
  byggForarKort(bas("m5", "Stefan Ek", { status: "skickat", andrad_efter_skickat: { at: "2026-11-12T09:00:00Z", dagar: ["2026-10-10", "2026-10-14", "2026-10-15", "2026-10-20"] } })),
];

async function htmlFor(el: JSX.Element): Promise<string> {
  document.body.innerHTML = "";
  const c = document.createElement("div");
  document.body.appendChild(c);
  const r = createRoot(c);
  await act(async () => { r.render(el); });
  const h = c.innerHTML;
  act(() => { r.unmount(); });
  return h;
}

const sida = (inner: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<style>html,body{margin:0;background:${FARG.bg};color:${FARG.text};font-family:${FONT}}`
  + `.material-symbols-outlined{font-size:0 !important;display:inline-block;width:22px;height:22px}</style></head>`
  + `<body><div style="max-width:640px;margin:0 auto;padding:16px">${inner}</div></body></html>`;

describe(`Löneunderlag — ${CHROMIUM ? "mätt i Chromium" : "HOPPAD ÖVER: ingen Chromium i miljön"}`, () => {
  it.skipIf(!CHROMIUM)("listan och arkets Att kolla: ingen sidscroll, inga träffytor under 44 px, inget utanför", async () => {
    const vyer = [
      { namn: "lista", html: await htmlFor(<Lista>{KORT.map((k, i) => <ForarListRad key={k.id} k={k} pagaende={false} onPaminn={() => {}} onOppna={() => {}} sista={i === KORT.length - 1} />)}</Lista>) },
      { namn: "att-kolla", html: await htmlFor(<AttKolla k={KORT[1]} kanKvittera onMal={() => {}} onKvittera={() => {}} onAngra={() => {}} />) },
    ];
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.LONEUNDERLAG_SKRIV;
    try {
      for (const v of vyer) {
        for (const s of SKARMAR) {
          const p = await b.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
          await p.setContent(sida(v.html));
          const r = await p.evaluate((min: number) => ({
            sidscroll: document.documentElement.scrollWidth > window.innerWidth,
            sma: Array.from(document.querySelectorAll("button, [role=button]"))
              .map(e => ({ t: (e.textContent || "?").trim().slice(0, 24), h: Math.round((e as HTMLElement).getBoundingClientRect().height) }))
              .filter(x => x.h + 0.5 < min),
            utanfor: Array.from(document.querySelectorAll("div, span, button"))
              .filter(e => (e as HTMLElement).getBoundingClientRect().right > window.innerWidth + 0.5)
              .map(e => (e.textContent || "").slice(0, 30)),
          }), TRAFFYTA.min);
          expect(r.sidscroll, `${v.namn} ${s.w}: sidscroll`).toBe(false);
          expect(r.sma, `${v.namn} ${s.w}: små träffytor ${JSON.stringify(r.sma)}`).toEqual([]);
          expect(r.utanfor, `${v.namn} ${s.w}: utanför skärmen`).toEqual([]);
          if (skriv) {
            fs.mkdirSync(skriv, { recursive: true });
            await p.screenshot({ path: path.join(skriv, `${v.namn}-${s.w}.png`), fullPage: true });
          }
          await p.close();
        }
      }
    } finally { await b.close(); }
  }, 120_000);
});
