// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL (design): ledighetsvyn efter tokens-bytet, Kolumnen och träffytorna.
 *
 * Det som vaktas här — och som tsc/lint inte ser:
 *  - TRÄFFYTOR: varje knapp/fält i Mig, Ansök-arket, Schema, Stopp-arket och Stopp-detaljen
 *    har en höjd på minst 44 px (jsdom har ingen layout; höjden läses ur stilen, och den RIKTIGA
 *    uppmätta höjden i webbläsaren står i PR-texten). Ikonknappar är minst 44 px breda.
 *  - Bekräftelsen är INLINE (Nej / Ja, …) — aldrig window.confirm — för Ta bort, Neka och Ta bort stopp.
 *  - En felstil (role="alert", ingen fixed toast).
 *  - Kolumnen: Mig i 640, Schema i 1120; dagantalet i Schema följer bredden.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Svar = { data?: unknown; error?: unknown } | "aldrig";
const mock = vi.hoisted(() => ({
  aktuell: {} as Record<string, Svar>,
  anrop: [] as string[],
  medarbetare: null as any,
}));

vi.mock("@/lib/supabase", () => {
  const kedja = (tabell: string) => {
    let enkel = false;
    let op = "";
    const p: any = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === "then") {
          const svar = mock.aktuell[`${tabell}.${op}`] ?? mock.aktuell[tabell];
          if (svar === "aldrig") return () => {};
          return (res: any, rej: any) => {
            const s = (svar ?? { data: null }) as { data?: unknown; error?: unknown };
            const rad = s.data === undefined ? null : s.data;
            return Promise.resolve({ data: s.error ? null : enkel ? rad : rad ?? [], error: s.error ?? null }).then(res, rej);
          };
        }
        if (prop === "delete" || prop === "update" || prop === "insert" || prop === "upsert") { op = prop; mock.anrop.push(`${tabell}.${prop}`); }
        if (prop === "single" || prop === "maybeSingle") return () => { enkel = true; return p; };
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  return { supabase: { from: (t: string) => kedja(t) } };
});

vi.mock("@/lib/CurrentMedarbetareContext", () => ({
  useCurrentMedarbetare: () => ({ medarbetare: mock.medarbetare, loading: false }),
}));

import type { CurrentMedarbetare } from "@/lib/CurrentMedarbetareContext";
import LedighetPage from "./page";
import MigVy from "./_components/MigVy";
import SchemaVy from "./_components/SchemaVy";
import { schemaDagar } from "./_components/schemaMatt";
import { toISO } from "./_components/datum";

const FORARE: CurrentMedarbetare = { id: "m-1", namn: "Test Förare", roll: "forare", maskin_id: null, partner_user_id: null };
const ADMIN: CurrentMedarbetare = { ...FORARE, id: "m-admin", namn: "Test Admin", roll: "admin" };
const SALDO = { semester_dagar_kvar: 12.5, atk_timmar_kvar: 24, kalla: "manuell", uppdaterad_at: "2026-10-01T07:00:00Z" };
const ANS = (id: string, mid: string, status: string, s: string, e: string, extra: object = {}) => ({
  id, medarbetare_id: mid, anvandare_id: "Någon Annan", typ: "semester", startdatum: s, slutdatum: e,
  status, kommentar: null, skapad_at: "2026-09-20T08:00:00Z", ersatter_datum: null, fran_tid: null, till_tid: null, ...extra,
});
const ALLA_TYPER = [
  ANS("a1", "m-1", "väntar", "2099-11-02", "2099-11-06"),
  ANS("a2", "m-1", "godkänd", "2099-12-21", "2099-12-31"),
  ANS("a3", "m-1", "godkänd", "2020-08-10", "2020-08-14"),
  ANS("a4", "m-1", "nekad", "2020-09-14", "2020-09-14", { typ: "atk" }),
];

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsol: ReturnType<typeof vi.spyOn>;
let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  konsol = vi.spyOn(console, "error").mockImplementation(() => {});
  confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
  mock.anrop = []; mock.aktuell = {}; mock.medarbetare = null;
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove();
  rot = null; behallare = null;
  konsol.mockRestore(); confirmSpy.mockRestore();
  delete (HTMLElement.prototype as any).clientWidth;
});

const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => document.body.textContent ?? "";
const alla = () => Array.from(document.querySelectorAll("button, input, textarea")) as HTMLElement[];
const knapp = (re: RegExp, inom: ParentNode = document) =>
  Array.from(inom.querySelectorAll("button")).find(b => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")) as HTMLButtonElement;
async function klicka(el: HTMLElement) { await act(async () => { el.click(); }); await flush(); }
async function montera(el: React.ReactElement) {
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(el); });
  await flush();
}
const px = (v: string) => (v ? parseFloat(v) : 0);
/** Allt som är tryckbart men har en höjd under 44 px (eller en ikonknapp smalare än 44 px). */
const forLitet = () => alla()
  .filter(e => {
    const t = (e.textContent ?? "").trim();
    const hog = Math.max(px(e.style.minHeight), px(e.style.height)) >= 44;
    const bred = Math.max(px(e.style.minWidth), px(e.style.width)) >= 44 || (!!e.style.flex && e.style.flex !== "none"); // flex: 1 → fyller raden
    const ikonknapp = !!e.getAttribute("aria-label") && !t;
    const kortText = t.length > 0 && t.length <= 5 && !/^\d+$/.test(t); // Nej, Rensa, Idag — kalenderns dagceller (siffror) får bredden av rutnätet
    return !hog || ((ikonknapp || kortText) && !bred);
  })
  .map(e => `${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute("aria-label") || e.getAttribute("placeholder") || "").trim().slice(0, 24)}" h=${e.style.minHeight || e.style.height || "?"} w=${e.style.width || "?"}`);

const MIG = (extra: Record<string, any> = {}) => ({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: ALLA_TYPER }, ...extra });

describe("Mig — grupperad lista, saldo, inline-bekräftelse", () => {
  it("tre grupper i ordning: Väntar på besked → Kommande ledighet → Historik (n, hopfälld)", async () => {
    mock.aktuell = MIG();
    await montera(<MigVy medarbetare={FORARE} />);
    const t = text();
    expect(t.indexOf("Väntar på besked")).toBeGreaterThan(-1);
    expect(t.indexOf("Väntar på besked")).toBeLessThan(t.indexOf("Kommande ledighet"));
    expect(t.indexOf("Kommande ledighet")).toBeLessThan(t.indexOf("Historik (2)"));
    expect(t).toContain("Låst — ändringar går via admin");
    // Hopfälld: historikens rader syns inte förrän man trycker
    expect(t).not.toContain("Togs ut");
    await klicka(knapp(/Historik \(2\)/));
    expect(text()).toContain("Togs ut");
    expect(text()).toContain("Nekad");
  });

  it("saldo: Semester är huvudtalet (32 px), ATK en lugn rad under", async () => {
    mock.aktuell = MIG();
    await montera(<MigVy medarbetare={FORARE} />);
    const t = text();
    expect(t.indexOf("Semester kvar")).toBeLessThan(t.indexOf("12,5"));
    expect(t.indexOf("12,5")).toBeLessThan(t.indexOf("ATK kvar"));
    expect(t.indexOf("ATK kvar")).toBeLessThan(t.indexOf("24 h"));
    const tal = Array.from(document.querySelectorAll("p")).find(p => p.textContent?.includes("12,5")) as HTMLElement;
    expect(tal.style.fontSize).toBe("32px");
    // ATK-värdet är inte ett andra huvudtal
    const atk = Array.from(document.querySelectorAll("span")).find(s => s.textContent === "24 h") as HTMLElement;
    expect(atk.style.fontSize).not.toBe("32px");
  });

  it("Ta bort: ingen webbläsardialog — bekräftelsen står i raden, och först 'Ja' tar bort", async () => {
    mock.aktuell = MIG();
    await montera(<MigVy medarbetare={FORARE} />);
    await klicka(knapp(/Ta bort/));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(text()).toContain("Ta bort ansökan?");
    expect(mock.anrop).not.toContain("ledighet_ansokningar.delete");
    await klicka(knapp(/^Nej$/));
    expect(text()).not.toContain("Ta bort ansökan?");
    expect(mock.anrop).not.toContain("ledighet_ansokningar.delete");
    await klicka(knapp(/Ta bort/));
    await klicka(knapp(/Ja, ta bort/));
    expect(mock.anrop).toContain("ledighet_ansokningar.delete");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("Neka (godkännare): bekräftelse i raden; Godkänn behöver ingen", async () => {
    mock.aktuell = { medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: [ANS("b1", "m-2", "väntar", "2099-11-02", "2099-11-06"), ANS("b2", "m-3", "väntar", "2099-11-09", "2099-11-13")] } };
    await montera(<MigVy medarbetare={ADMIN} />);
    await klicka(knapp(/2 att godkänna/));
    await klicka(knapp(/^Neka$/));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(text()).toContain("Neka ansökan?");
    expect(mock.anrop).not.toContain("ledighet_ansokningar.update");
    await klicka(knapp(/^Nej$/));
    expect(text()).not.toContain("Neka ansökan?");
    expect(mock.anrop).not.toContain("ledighet_ansokningar.update");
    await klicka(knapp(/^Neka$/));
    await klicka(knapp(/Ja, neka/));
    expect(mock.anrop).toContain("ledighet_ansokningar.update");
  });

  it("fel vid Godkänn/Neka står i godkänn-sektionen, vid raderna — inte högst upp på sidan", async () => {
    mock.aktuell = { medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: [ANS("b1", "m-2", "väntar", "2099-11-02", "2099-11-06")] }, "ledighet_ansokningar.update": { error: { message: "nej" } } };
    await montera(<MigVy medarbetare={ADMIN} />);
    await klicka(knapp(/1 att godkänna/));
    await klicka(knapp(/^Godkänn$/));
    const fel = document.querySelector('[role="alert"]') as HTMLElement;
    expect(fel.textContent).toContain("Kunde inte spara");
    const sektion = knapp(/1 att godkänna/).closest("section")!;
    expect(sektion.contains(fel)).toBe(true);
  });

  it("EN felstil: ett misslyckat borttag visas som role=alert vid raden — ingen fixed toast", async () => {
    mock.aktuell = MIG({ "ledighet_ansokningar.delete": { error: { message: "nej" } } });
    await montera(<MigVy medarbetare={FORARE} />);
    await klicka(knapp(/Ta bort/));
    await klicka(knapp(/Ja, ta bort/));
    const fel = document.querySelector('[role="alert"]');
    expect(fel?.textContent).toContain("Kunde inte ta bort");
    const fixedRod = Array.from(document.querySelectorAll<HTMLElement>("*")).filter(e => e.style.position === "fixed" && /153, 27, 27|rgb\(239, 68, 68\)/.test(e.style.background));
    expect(fixedRod).toHaveLength(0);
    expect(fs.existsSync(path.resolve(__dirname, "_components/Toast.tsx"))).toBe(false);
  });
});

describe("Ansök-arket", () => {
  const oppna = async () => {
    mock.aktuell = MIG();
    await montera(<MigVy medarbetare={FORARE} />);
    await klicka(knapp(/Ansök om ledighet/));
  };

  it("ark: dialog, Avbryt i rubrikraden, Skicka spärrad med förklaring tills typ + period är valda", async () => {
    await oppna();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.querySelector("h2")?.textContent).toBe("Ansök om ledighet");
    expect(knapp(/^Avbryt$/, dialog)).toBeTruthy();
    expect(text()).toContain("Välj typ + datum för att skicka");
    expect(knapp(/Skicka ansökan/, dialog).disabled).toBe(true);
    await klicka(knapp(/^Semester$|Semester$/, dialog));
    await klicka(knapp(/^20$/, dialog));
    await klicka(knapp(/^22$/, dialog));
    expect(knapp(/Skicka ansökan/, dialog).disabled).toBe(false);
    expect(text()).not.toContain("Välj typ + datum för att skicka");
  });

  it("kalenderns valda dagar i tokens-färg: vit fyllning på ändpunkterna, aldrig blå fyllning", async () => {
    await oppna();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    await klicka(knapp(/^20$/, dialog));
    await klicka(knapp(/^22$/, dialog));
    const bakgrunder = Array.from(dialog.querySelectorAll<HTMLElement>("*")).map(e => e.style.background);
    expect(bakgrunder.some(b => /rgb\(255, 255, 255\)/.test(b))).toBe(true);
    expect(bakgrunder.filter(b => /rgb\(10, 132, 255\)|rgb\(59, 130, 246\)/.test(b))).toHaveLength(0);
  });

  it("Escape och tryck utanför stänger arket", async () => {
    await oppna();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await klicka(knapp(/Ansök om ledighet/));
    await klicka(document.querySelector('[role="dialog"]') as HTMLElement);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("arkets innehåll har sidopadding (en padding utan enhet kasseras av webbläsaren — då ligger allt kant i kant)", async () => {
    await oppna();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const innehall = dialog.querySelector("h2")!.parentElement!.nextElementSibling as HTMLElement; // scrollområdet under rubrikraden
    expect(innehall.style.paddingLeft).toBe("16px");
    expect(innehall.style.paddingRight).toBe("16px");
    expect(innehall.style.paddingBottom).not.toBe("");
    // Knappraden under har max(…, env(safe-area-inset-bottom)) — det kan jsdom inte tolka (det kastar
    // deklarationen), så hemindikatorhänsynen vaktas i källan (nästa test) och mäts i webbläsaren.
    const fot = innehall.nextElementSibling as HTMLElement;
    expect(fot.querySelector("button")?.textContent).toBe("Skicka ansökan");
  });

  it("arket är 520 px, förankrat nederst och har hemindikatorhänsyn (källvakt)", () => {
    const ark = fs.readFileSync(path.resolve(__dirname, "../../components/design/Ark.tsx"), "utf8");
    expect(ark).toContain("KOLUMN.ark");
    expect(ark).toContain("medSafeBotten(");
    expect(ark).toContain('alignItems: "flex-end"');
    const tokens = fs.readFileSync(path.resolve(__dirname, "../../lib/design/tokens.ts"), "utf8");
    expect(tokens).toMatch(/ark:\s*520/);
  });
});

describe("Schema — Kolumnen, dagantal efter bredd, stoppblock", () => {
  const idag = toISO(new Date());
  const om = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return toISO(d); };
  const SCHEMA = () => ({
    medarbetare_namn: { data: [{ id: "m-1", fornamn: "Stefan" }, { id: "m-3", fornamn: "Oskar" }] },
    ledighet_ansokningar: { data: [{ medarbetare_id: "m-3", typ: "semester", startdatum: om(1), slutdatum: om(3) }] },
    dim_maskin: { data: [{ maskin_id: "R64428", visningsnamn: "Rottne 428", modell: "H8E", maskin_typ: "Harvester", aktiv_till: null }] },
    stopp: { data: [{ id: "s1", fran_datum: idag, till_datum: idag, orsak: "semesterstopp", kommentar: "Ett dygn" }] },
    stopp_maskin: { data: [{ stopp_id: "s1", maskin_id: "R64428" }] },
  });
  const bredd = (px: number) => Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return px; } });

  it("schemaDagar: telefon 21 dagar à 34 px (oförändrat), annars hela veckor som ryms utan scroll", () => {
    expect(schemaDagar(0)).toEqual({ antal: 21, dagBredd: 34 });
    expect(schemaDagar(358)).toEqual({ antal: 21, dagBredd: 34 });
    expect(schemaDagar(638).antal).toBe(14);
    expect(schemaDagar(992).antal).toBe(21);    // 1024 liggande
    expect(schemaDagar(1120).antal).toBe(28);   // 1440
    for (const b of [638, 800, 992, 1120]) {
      const { antal, dagBredd } = schemaDagar(b);
      expect(110 + antal * dagBredd).toBeCloseTo(b, 5); // fyller kolumnen exakt, ingen scroll
      expect(dagBredd).toBeGreaterThanOrEqual(34);
    }
  });

  it("rutnätet följer kolumnens bredd: 358 → 21 dagar, 992 → 21, 1120 → 28", async () => {
    mock.aktuell = SCHEMA();
    bredd(358);
    await montera(<SchemaVy arGodkannare egenMedarbetareId="m-admin" />);
    expect(document.querySelectorAll("[data-dag]")).toHaveLength(21);
    act(() => { rot!.unmount(); }); rot = null;
    bredd(1120);
    await montera(<SchemaVy arGodkannare egenMedarbetareId="m-admin" />);
    expect(document.querySelectorAll("[data-dag]")).toHaveLength(28);
  });

  it("stoppblocket är en knapp ≥ 44 px (höjd och bredd), och trycket öppnar ett ark — inte en dialog", async () => {
    mock.aktuell = SCHEMA();
    await montera(<SchemaVy arGodkannare egenMedarbetareId="m-admin" />);
    const block = knapp(/Maskinstopp/);
    expect(px(block.style.height)).toBeGreaterThanOrEqual(44);
    expect(px(block.style.width)).toBeGreaterThanOrEqual(44); // ett endagsstopp (34 px) får ändå träffyta
    await klicka(block);
    expect(confirmSpy).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("Maskinstopp");
    expect(dialog.textContent).toContain("Semesterstopp");
    expect(dialog.textContent).toContain("Rottne 428");
    expect(dialog.textContent).toContain("Ett dygn");
    expect(mock.anrop).not.toContain("stopp.delete"); // att öppna är inte att ta bort
  });

  it("Ta bort stopp: bekräftelse i arket (Nej / Ja, ta bort); först 'Ja' raderar", async () => {
    mock.aktuell = SCHEMA();
    await montera(<SchemaVy arGodkannare egenMedarbetareId="m-admin" />);
    await klicka(knapp(/Maskinstopp/));
    await klicka(knapp(/Ta bort stopp/));
    expect(text()).toContain("Ta bort stoppet");
    expect(text()).toContain("Det gäller 1 maskin.");
    expect(mock.anrop).not.toContain("stopp.delete");
    await klicka(knapp(/^Nej$/));
    expect(mock.anrop).not.toContain("stopp.delete");
    await klicka(knapp(/Ta bort stopp/));
    await klicka(knapp(/Ja, ta bort/));
    expect(mock.anrop).toContain("stopp.delete");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("förare (inte godkännare): stoppet syns men är ingen knapp", async () => {
    mock.aktuell = SCHEMA();
    await montera(<SchemaVy arGodkannare={false} egenMedarbetareId="m-1" />);
    expect(document.querySelector('button[aria-label^="Maskinstopp"]')).toBeNull();
    expect(text()).toContain("Rottne 428");
  });

  it("läsfel i Schema: texten säger vad man gör och har en 'Försök igen'-knapp", async () => {
    mock.aktuell = { ...SCHEMA(), stopp: { error: { message: "nej" } } };
    await montera(<SchemaVy arGodkannare egenMedarbetareId="m-admin" />);
    expect(text()).toContain("Kunde inte läsa schemat. Kontrollera uppkopplingen och försök igen.");
    expect(knapp(/Försök igen/)).toBeTruthy();
  });
});

describe("Sidan — Kolumnen och flikkontrollen", () => {
  it("Mig i den smala kolumnen (640), Schema i den breda (1120); flikkontroll med 44 px-flikar", async () => {
    mock.medarbetare = FORARE;
    mock.aktuell = MIG({ medarbetare_namn: { data: [] }, dim_maskin: { data: [] }, stopp: { data: [] }, stopp_maskin: { data: [] } });
    await montera(<LedighetPage />);
    const maxBredder = () => Array.from(document.querySelectorAll<HTMLElement>("*")).map(e => e.style.maxWidth).filter(Boolean);
    expect(maxBredder()).toContain("640px");
    expect(maxBredder()).not.toContain("1120px");
    const flikar = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(flikar.map(f => f.textContent)).toEqual(["Mig", "Schema"]);
    for (const f of flikar) expect(px(f.style.minHeight)).toBeGreaterThanOrEqual(44);
    await klicka(flikar[1]);
    expect(maxBredder()).toContain("1120px");
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Schema");
  });
});

describe("Träffytor — alla tryckbara mål, alla lägen", () => {
  it("vakten själv: en 36 px hög knapp, en ikonknapp på 34 px och ett 20 px fält larmar", async () => {
    await montera(<div><button style={{ minHeight: 36 }}>Ändra</button><button aria-label="Nästa" style={{ minHeight: 44, width: 34 }} /><input style={{ height: 20 }} /><button style={{ minHeight: 44 }}>Nej</button><button style={{ minHeight: 44, minWidth: 44 }}>Nej</button></div>);
    expect(forLitet()).toHaveLength(4); // 36 hög, ikonknapp 34 bred, fält 20 hög, "Nej" utan minbredd
  });

  it("Mig: friskt + Historik öppen + bekräftelse", async () => {
    mock.aktuell = MIG();
    await montera(<MigVy medarbetare={FORARE} />);
    await klicka(knapp(/Historik \(2\)/));
    expect(forLitet()).toEqual([]);
    await klicka(knapp(/Ta bort/));
    expect(forLitet()).toEqual([]); // Nej / Ja, ta bort
  });

  it("Mig (godkännare): 'att godkänna' öppen, Godkänn/Neka och bekräftelsen", async () => {
    mock.aktuell = { medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: [ANS("b1", "m-2", "väntar", "2099-11-02", "2099-11-06")] } };
    await montera(<MigVy medarbetare={ADMIN} />);
    await klicka(knapp(/att godkänna/));
    expect(forLitet()).toEqual([]);
    await klicka(knapp(/^Neka$/));
    expect(forLitet()).toEqual([]);
  });

  it("Mig: läsfel (Försök igen) och saldofel", async () => {
    mock.aktuell = { medarbetare_saldo: { error: { message: "x" } }, ledighet_ansokningar: { error: { message: "x" } } };
    await montera(<MigVy medarbetare={FORARE} />);
    expect(forLitet()).toEqual([]);
  });

  it("Ansök-arket med period vald, och bytesdag-läget", async () => {
    mock.aktuell = MIG();
    await montera(<MigVy medarbetare={FORARE} />);
    await klicka(knapp(/Ansök om ledighet/));
    await klicka(knapp(/Semester$/));
    await klicka(knapp(/^20$/));
    await klicka(knapp(/^22$/));
    expect(forLitet()).toEqual([]);
    await klicka(knapp(/Inarbetad dag/));
    expect(forLitet()).toEqual([]);
  });

  it("Schema (godkännare): navigering, Lägg till stopp, stoppblock, Stopp-arket och Stopp-detaljen", async () => {
    const idag = toISO(new Date());
    mock.aktuell = {
      medarbetare_namn: { data: [{ id: "m-1", fornamn: "Stefan" }] }, ledighet_ansokningar: { data: [] },
      dim_maskin: { data: [{ maskin_id: "R64428", visningsnamn: "Rottne 428", modell: "H8E", maskin_typ: "Harvester", aktiv_till: null }, { maskin_id: "A030353", visningsnamn: "Wisent2015", modell: "W", maskin_typ: "Forwarder", aktiv_till: null }] },
      stopp: { data: [{ id: "s1", fran_datum: idag, till_datum: idag, orsak: "semesterstopp", kommentar: null }] }, stopp_maskin: { data: [{ stopp_id: "s1", maskin_id: "R64428" }] },
    };
    await montera(<SchemaVy arGodkannare egenMedarbetareId="m-admin" />);
    await klicka(knapp(/Nästa vecka/));              // "Idag"-knappen dyker upp
    expect(forLitet()).toEqual([]);
    await klicka(knapp(/Lägg till stopp/));
    await klicka(knapp(/Alla maskiner/));
    expect(forLitet()).toEqual([]);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await klicka(knapp(/Idag/));
    await klicka(knapp(/Maskinstopp/));
    expect(forLitet()).toEqual([]);
    await klicka(knapp(/Ta bort stopp/));
    expect(forLitet()).toEqual([]);
  });
});
