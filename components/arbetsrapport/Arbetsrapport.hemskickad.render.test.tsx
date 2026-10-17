// @vitest-environment jsdom
/**
 * Hemskickad i förarens Arbetsrapport (Martin 2026-10-17): valet "Maskinen gick sönder / väder" i "Åkte hem" (Dag-vyn).
 *  - medan passet pågår: kortet "Åker hem" har valet bredvid sjuk, VAB och föräldraledig; ett tryck skriver en deldagsrad (typ hemskickad,
 *    status registrerad, klockslaget föraren åkte hem) och dagen säger att den fylls upp till 8 tim och betalas;
 *  - när passet är slut: dagen säger vad som betalas, "Hemskickad 2:00 – betalas" (8 tim minus de 6 arbetade), aldrig "frånvaro";
 *  - morgonkortet (hel dag) har INTE valet: en hel dag hemskickad betyder inget.
 *
 * Supabase är en kedjebar fake med tabeller (arbetsdag, ledighet_ansokningar) och en logg över det som skrivs.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DELDAG_VAL, FRANVARO_VAL, FRANVARO_ANMALS, DELDAG_UNDERRAD, FRANVARO_UNDERRAD } from "@/lib/franvaro";

const FORARE = { id: "m-1", namn: "Test Förare", epost: "test@example.com", roll: "forare", maskin_id: "PONS20SDJAA270231", user_id: "u-1", hemadress: "" };
const IDAG = new Date().toISOString().slice(0, 10);
const DB: Record<string, any[]> = {};
const SKRIVET: { tabell: string; rad: any }[] = [];

vi.mock("@/lib/supabase", () => {
  const kedja = (tabell: string) => {
    let enkel = false;
    let insatt: any = null;
    const svar = () => {
      if (insatt) return { data: enkel ? insatt : [insatt], error: null, count: 0 };
      const rader = tabell === "medarbetare" ? [FORARE] : (DB[tabell] || []);
      return { data: enkel ? (rader[0] ?? null) : rader, error: null, count: 0 };
    };
    const p: any = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === "then") return (res: any, rej: any) => Promise.resolve(svar()).then(res, rej);
        if (prop === "single" || prop === "maybeSingle") return () => { enkel = true; return p; };
        if (prop === "insert") return (rad: any) => { insatt = { id: `ny-${SKRIVET.length}`, ...rad }; SKRIVET.push({ tabell, rad }); return p; };
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  return {
    supabase: {
      from: (t: string) => kedja(t),
      auth: {
        getUser: async () => ({ data: { user: { id: "u-1", email: FORARE.epost } } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: "n/a" } }) }) },
      rpc: () => kedja("rpc"),
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
    },
  };
});

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of Object.keys(DB)) delete DB[k];
  SKRIVET.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })));
  window.history.replaceState({}, "", "/arbetsrapport");
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

const stilla = async (n = 4) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
async function montera() {
  const { default: Arbetsrapport } = await import("./Arbetsrapport");
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<Arbetsrapport />); });
  await stilla(10);
  await act(async () => { await new Promise(r => setTimeout(r, 700)); }); // <Tillstand> tonar över till nästa tillstånd (250 ms) — vänta in det
}
const knapp = (t: string) => Array.from(behallare!.querySelectorAll("button")).find(b => (b.textContent || "").includes(t));
async function klicka(t: string) {
  const k = knapp(t);
  if (!k) throw new Error(`hittar ingen knapp: ${t} — sidan säger: ${(behallare!.textContent || "").slice(0, 300)}`);
  await act(async () => { k.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await stilla();
}
const sidan = () => Array.from(behallare!.querySelectorAll("main")).map(e => e.textContent || "").join(" | ");
const hemRad = () => behallare!.querySelector("[data-hemskickad]")?.textContent || "";

/** Dagen som maskinen skrivit: passet startat 06:00. `slut` = passet klart (arbetad_min = 360 → 6 tim). */
const pass = (o: Record<string, any> = {}) => ({
  id: "a-1", medarbetare_id: "m-1", datum: IDAG, start_tid: "06:00:00", slut_tid: null, rast_min: 0, arbetad_min: null, maskin_id: "PONS20SDJAA270231", objekt_id: null,
  km_totalt: 0, km_morgon: 0, km_kvall: 0, bekraftad: false, bekraftad_tid: null, status: "saknas", ...o,
});

describe("lib/franvaro: valen", () => {
  it("'Åkte hem' har hemskickad bredvid sjuk/VAB/föräldraledig; morgonkortet (hel dag) har den inte", () => {
    expect(DELDAG_VAL.map(v => v.id)).toEqual(["sjuk", "vab", "foraldraledig", "hemskickad"]);
    expect(FRANVARO_VAL.map(v => v.id)).toEqual(["sjuk", "vab", "foraldraledig"]);
    expect(DELDAG_VAL.find(v => v.id === "hemskickad")!.label).toBe("Maskinen gick sönder / väder");
    expect(DELDAG_UNDERRAD).toBe("Sjuk, VAB, Föräldraledig, Hemskickad");
    expect(FRANVARO_UNDERRAD).toBe("Sjuk, VAB, Föräldraledig");
    // alla val kan anmälas (RLS släpper igenom dem som 'registrerad')
    for (const v of DELDAG_VAL) expect(FRANVARO_ANMALS).toContain(v.id);
  });
});

describe("Dag-vyn: Åker hem → Maskinen gick sönder / väder", () => {
  it("medan passet pågår: valet finns, ett tryck skriver en hemskickad deldag och dagen säger att den betalas upp till 8 tim", async () => {
    DB.arbetsdag = [pass()];
    await montera();
    expect(knapp("Åker hem"), "kortet Åker hem").toBeTruthy();
    expect(behallare!.textContent).toContain("Sjuk, VAB, Föräldraledig, Hemskickad — resten av dagen");
    await klicka("Åker hem");
    expect(knapp("Maskinen gick sönder / väder")).toBeTruthy();
    expect(knapp("Sjukfrånvaro")).toBeTruthy();
    await klicka("Maskinen gick sönder / väder");
    const skrivet = SKRIVET.filter(s => s.tabell === "ledighet_ansokningar");
    expect(skrivet).toHaveLength(1);
    expect(skrivet[0].rad).toMatchObject({ typ: "hemskickad", status: "registrerad", kalla: "morgonkort", startdatum: IDAG, slutdatum: IDAG, till_tid: null });
    expect(skrivet[0].rad.fran_tid).toMatch(/^\d{2}:\d{2}$/);
    expect(sidan()).toContain("Hemskickad – dagen fylls upp till 8 tim och betalas");
    expect(sidan()).not.toMatch(/förmiddagen räknas som arbete/);
  });

  it("det sparade klockslaget är nu (det föraren vet: 'åkte hem klockan …'), aldrig en sluttid", async () => {
    DB.arbetsdag = [pass()];
    await montera();
    await klicka("Åker hem");
    await klicka("Maskinen gick sönder / väder");
    const fran = SKRIVET[0].rad.fran_tid as string;
    const nu = new Date();
    const [h, m] = fran.split(":").map(Number);
    expect(Math.abs((h * 60 + m) - (nu.getHours() * 60 + nu.getMinutes()))).toBeLessThanOrEqual(2);
    expect(SKRIVET[0].rad.till_tid).toBeNull();
  });

  it("sjuk från samma kort är fortfarande en frånvaro-deldag (inget har blandats ihop)", async () => {
    DB.arbetsdag = [pass()];
    await montera();
    await klicka("Åker hem");
    await klicka("Sjukfrånvaro");
    expect(SKRIVET[0].rad).toMatchObject({ typ: "sjuk", status: "registrerad" });
    expect(sidan()).not.toContain("Hemskickad –");
    expect(sidan()).toContain("Sjukdag från");
  });

  it("passet klart (6 tim arbete) och hemskickad kl 14: dagen säger 'Hemskickad 2:00 – betalas'", async () => {
    DB.arbetsdag = [pass({ slut_tid: "12:00:00", arbetad_min: 360, bekraftad: true, bekraftad_tid: new Date().toISOString(), status: "ok" })];
    DB.ledighet_ansokningar = [{ id: "l-1", medarbetare_id: "m-1", typ: "hemskickad", startdatum: IDAG, slutdatum: IDAG, status: "registrerad", ersatter_datum: null, fran_tid: "14:00:00", till_tid: null }];
    await montera();
    expect(hemRad()).toBe("Hemskickad 2:00 – betalas");
    expect(sidan()).not.toMatch(/förmiddagen räknas som arbete|frånvaro/i);
  });

  it("extra tid den dagen räknas som arbetad tid: 6 tim maskin + 1 tim planering → 'Hemskickad 1:00 – betalas'", async () => {
    DB.arbetsdag = [pass({ slut_tid: "12:00:00", arbetad_min: 360, bekraftad: true, bekraftad_tid: new Date().toISOString(), status: "ok" })];
    DB.extra_tid = [{ id: "e-1", medarbetare_id: "m-1", datum: IDAG, start_tid: "12:00:00", slut_tid: "13:00:00", minuter: 60, aktivitet_typ: "planering", objekt_id: null }];
    DB.ledighet_ansokningar = [{ id: "l-1", medarbetare_id: "m-1", typ: "hemskickad", startdatum: IDAG, slutdatum: IDAG, status: "registrerad", ersatter_datum: null, fran_tid: "14:00:00", till_tid: null }];
    await montera();
    expect(hemRad()).toBe("Hemskickad 1:00 – betalas");
  });

  it("morgonkortet före passet (hel dag) har inte valet", async () => {
    DB.arbetsdag = [];
    await montera();
    const kort = knapp("Frånvaro");
    expect(kort, "kortet Frånvaro").toBeTruthy();
    await klicka("Frånvaro");
    expect(knapp("Sjukfrånvaro")).toBeTruthy();
    expect(knapp("Maskinen gick sönder / väder")).toBeUndefined();
  });
});

describe("Redigera: Åkte hem-sheeten har hemskickad", () => {
  const oppnaRedigera = async () => { await klicka("Något fel?"); await klicka("Hela dagen"); await stilla(6); };
  const dagenFardig = () => pass({ slut_tid: "12:00:00", arbetad_min: 360 });

  it("länken heter 'Åkte hem sjuk, VAB, föräldraledig eller hemskickad?' och sheeten har alla fyra val", async () => {
    DB.arbetsdag = [dagenFardig()];
    await montera();
    await oppnaRedigera();
    await klicka("Åkte hem sjuk, VAB, föräldraledig eller hemskickad?");
    for (const v of ["Sjukfrånvaro", "VAB", "Föräldraledig", "Maskinen gick sönder / väder"]) expect(knapp(v), v).toBeTruthy();
    expect(behallare!.textContent).toContain("Förmiddagen räknas som arbete. Frånvarotimmarna räknas mot 8 tim per dag tills schema är beslutat.");
    await klicka("Maskinen gick sönder / väder");
    expect(behallare!.textContent).toContain("Du får betalt för resten av dagen: dagen fylls upp till 8 tim som timlön.");
    expect(behallare!.textContent).not.toContain("Förmiddagen räknas som arbete. Frånvarotimmarna");
  });

  it("registrera: klockslaget i fältet blir fran_tid, dagen säger 'Hemskickad 2:00 – betalas'", async () => {
    DB.arbetsdag = [dagenFardig()];
    await montera();
    await oppnaRedigera();
    await klicka("Åkte hem sjuk, VAB, föräldraledig eller hemskickad?");
    await klicka("Maskinen gick sönder / väder");
    const tid = behallare!.querySelector<HTMLInputElement>('input[type="time"]')!;
    const satt = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { satt.call(tid, "14:00"); tid.dispatchEvent(new Event("input", { bubbles: true })); });
    await klicka("Registrera");
    const skrivet = SKRIVET.filter(s => s.tabell === "ledighet_ansokningar");
    expect(skrivet).toHaveLength(1);
    expect(skrivet[0].rad).toMatchObject({ typ: "hemskickad", startdatum: IDAG, slutdatum: IDAG, fran_tid: "14:00", till_tid: null, status: "registrerad" });
    expect(hemRad()).toBe("Hemskickad 2:00 – betalas.");
    expect(knapp("Åkte hem sjuk")).toBeUndefined(); // en registrerad deldag ersätter länken
  });

  it("utan val: 'Välj varför du åkte hem.' — ingenting skrivs", async () => {
    DB.arbetsdag = [dagenFardig()];
    await montera();
    await oppnaRedigera();
    await klicka("Åkte hem sjuk, VAB, föräldraledig eller hemskickad?");
    await klicka("Registrera");
    expect(SKRIVET).toHaveLength(0);
    expect(behallare!.textContent).toContain("Välj varför du åkte hem.");
  });
});
