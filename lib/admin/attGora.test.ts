import { describe, it, expect, vi } from "vitest";

// Datahälsas hook drar in supabase; här behövs bara tröskeln.
vi.mock("@/app/datahalsa/useDatahalsa", () => ({ LEV_GUL_DYGN: 10 }));

import { byggAttGora, avtalKraverDig, type AttGoraIndata } from "./attGora";
import type { ArbetstidForare, Gransstatus, Niva } from "@/lib/arbetstidsgranser";

const ok = <T,>(data: T) => ({ data, fel: null as string | null });
const lugnt = (): AttGoraIndata => ({
  kontroller: ok({ okandaOperatorer: [], forareUtanMaskin: [], saknarHempunkt: [], obekraftadHempunkt: [] } as any),
  personer: ok([{ id: "m1", namn: "Anna Berg", user_id: "u1" }]),
  maskiner: ok([{ maskin_id: "R1", visningsnamn: "H8E", modell: null, bekraftad: true, aktiv_till: null }]),
  obekraftade: ok([]),
  lon: ok({ arbetsManad: "2026-09", antalMedDagar: 2, antalSkickade: 2 }),
  vilobrott: ok([]),
  avtal: ok({ giltigt_till: "2027-03-31" }),
  arbetstid: ok({ forare: [], varningar: [] }),
  leverans: ok([{ maskinId: "R1", namn: "H8E", aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: "2026-10-06", dagarSedan: 1 }]),
});

describe("avtalKraverDig: inom en månad eller redan utgånget", () => {
  it.each([
    ["2027-03-31", null], ["2026-11-08", null], ["2026-11-07", "snart"], ["2026-10-07", "snart"], ["2026-10-06", "utgatt"], [null, null],
  ])("%s → %s (idag 7 okt)", (till, svar) => { expect(avtalKraverDig(till as any, "2026-10-07")).toBe(svar); });
});

describe("byggAttGora", () => {
  it("allt stämmer: inga saker, åtta rader som stämmer", () => {
    const r = byggAttGora(lugnt(), "2026-10-07");
    expect(r.saker).toEqual([]);
    expect(r.stammer.map(s => s.id).sort()).toEqual(["arbetstid", "avtal", "dagar", "lon", "maskinfiler", "operatorer", "personer", "vila"]);
  });

  it("en källa som fallerar är en sak, inte en nolla — och den stämmer inte", () => {
    const i = lugnt(); i.vilobrott = { data: null, fel: "timeout" };
    const r = byggAttGora(i, "2026-10-07");
    expect(r.saker).toHaveLength(1);
    expect(r.saker[0]).toMatchObject({ rubrik: "Kunde inte kontrollera vilobrott", detalj: "timeout", mal: { typ: "forsok" } });
    expect(r.stammer.find(s => s.id === "vila")).toBeUndefined();
  });

  it("dagar som väntar: en rad, grupperad per person, länk med rätt månad (föregående = offset -1) och bara avvikelser", () => {
    const i = lugnt();
    i.obekraftade = ok([{ medarbetare_id: "m1", datum: "2026-09-04" }, { medarbetare_id: "m1", datum: "2026-09-03" }]);
    const r = byggAttGora(i, "2026-10-07");
    const s = r.saker.find(x => x.id === "dagar")!;
    expect(s.rubrik).toBe("2 dagar väntar på bekräftelse");
    expect(s.detalj).toBe("Anna Berg: 3 sep, 4 sep");
    expect(s.mal).toEqual({ typ: "flik", flik: "lon", underflik: "dagar", params: { dagper: "M", dagoff: "-1", avv: "1" } });
  });

  it("dagar bara i innevarande månad → offset 0", () => {
    const i = lugnt(); i.obekraftade = ok([{ medarbetare_id: "m1", datum: "2026-10-05" }]);
    const s = byggAttGora(i, "2026-10-07").saker.find(x => x.id === "dagar")!;
    expect(s.rubrik).toBe("1 dag väntar på bekräftelse");
    expect((s.mal as any).params.dagoff).toBe("0");
  });

  it("lönen: ej skickad → sak; delvis skickad → antalet står; ingen förare med dagar → ingen rad alls", () => {
    const i = lugnt(); i.lon = ok({ arbetsManad: "2026-09", antalMedDagar: 3, antalSkickade: 1 });
    const s = byggAttGora(i, "2026-10-07").saker.find(x => x.id === "lon")!;
    expect(s).toMatchObject({ rubrik: "Lönen för september är klar att granska", detalj: "1 av 3 förare är skickade till Fortnox" });
    const tom = lugnt(); tom.lon = ok({ arbetsManad: "2026-09", antalMedDagar: 0, antalSkickade: 0 });
    const r = byggAttGora(tom, "2026-10-07");
    expect(r.saker).toEqual([]);
    expect(r.stammer.find(x => x.id === "lon")).toBeUndefined();
  });

  it("personer: maskin, hempunkt och inloggning samlas på EN rad per person", () => {
    const i = lugnt();
    i.personer = ok([{ id: "m2", namn: "Erik Lind", user_id: null }]);
    i.kontroller = ok({ okandaOperatorer: [], forareUtanMaskin: [{ id: "m2", namn: "Erik Lind" }], saknarHempunkt: [{ id: "m2", namn: "Erik Lind", orsak: "osaker" }] } as any);
    const r = byggAttGora(i, "2026-10-07");
    const rader = r.saker.filter(s => s.id.startsWith("person-"));
    expect(rader).toHaveLength(1);
    expect(rader[0].detalj).toBe("saknar maskin · hemadressen är osäker · ingen inloggning kopplad");
    expect(rader[0].mal).toEqual({ typ: "flik", flik: "medarbetare", params: { person: "m2" } });
  });

  it("vilobrott: bara obesvarade, en rad per person", () => {
    const i = lugnt();
    const b = (typ: string, datum: string, svar: string | null) => ({ medarbetare_id: "m1", namn: "Anna Berg", typ, datum, vila_h: 8.5, krav_h: 11, svar, vecka: 40, år: 2026, beskrivning: "" }) as any;
    i.vilobrott = ok([b("dygnsvila", "2026-09-29", null), b("veckovila", "2026-09-29", "Akut situation"), b("dygnsvila", "2026-09-20", null)]);
    const r = byggAttGora(i, "2026-10-07");
    const rader = r.saker.filter(s => s.id.startsWith("vila-"));
    expect(rader).toHaveLength(1);
    expect(rader[0].rubrik).toBe("Anna Berg: 2 obesvarade vilobrott");
    expect(rader[0].detalj).toBe("20 sep dygnsvila 8,5 h · 29 sep dygnsvila 8,5 h");
    // raden öppnar personens vilobrott (ett ark med dagarna), inte hela vilobrottslistan
    expect(rader[0].mal).toEqual({ typ: "vilobrott", medarbetare_id: "m1" });
  });

  it("maskiner: ny (obekräftad, ej ur drift) → sak med länk till maskinen; avtal utgånget → sak", () => {
    const i = lugnt();
    i.maskiner = ok([{ maskin_id: "R9", visningsnamn: null, modell: "H8E", bekraftad: false, aktiv_till: null }, { maskin_id: "R8", visningsnamn: "Gammal", modell: null, bekraftad: false, aktiv_till: "2026-01-01" }]);
    i.avtal = ok({ giltigt_till: "2026-09-30" });
    const r = byggAttGora(i, "2026-10-07");
    expect(r.saker.map(s => s.id).sort()).toEqual(["avtal", "maskin-R9"]);
    expect(r.saker.find(s => s.id === "maskin-R9")!.mal).toEqual({ typ: "flik", flik: "maskiner", params: { maskin: "R9" } });
    expect(r.saker.find(s => s.id === "avtal")!.rubrik).toBe("Avtalet har gått ut");
  });
});

describe("byggAttGora: hempunkt som ingen bekräftat", () => {
  it("en egen rad per person, 'Hempunkten är inte bekräftad – namn', som leder till personen (där kartan finns)", () => {
    const i = lugnt();
    (i.kontroller.data as any).obekraftadHempunkt = [{ id: "m1", namn: "Nils Ek" }];
    const r = byggAttGora(i, "2026-10-07");
    const s = r.saker.find(x => x.id === "hempunkt-m1")!;
    expect(s.rubrik).toBe("Hempunkten är inte bekräftad – Nils Ek");
    expect(s.knapp).toBe("Öppna"); // en knapp, ett ord: raden säger vad det gäller
    expect(s.mal).toEqual({ typ: "flik", flik: "medarbetare", params: { person: "m1" } });
  });
  it("när alla är bekräftade finns ingen sådan rad", () => {
    const r = byggAttGora(lugnt(), "2026-10-07");
    expect(r.saker.some(x => x.id.startsWith("hempunkt-"))).toBe(false);
  });
});

describe("byggAttGora: arbetstid — lagens sex gränser (lib/arbetstidsgranser)", () => {
  const gr = (id: Gransstatus["id"], niva: Niva): Gransstatus => ({ id, namn: id, niva, varde: 1, grans: 2, enhet: "tim", andel: 0.5, mening: "x", varfor: "§" });
  const forare = (namn: string, varsta: Niva, delagare = false): ArbetstidForare => ({ medarbetare_id: namn, namn, varsta: delagare ? "lugn" : varsta, foretagsledare: delagare, ...(delagare ? { skulleVarit: varsta } : {}), granser: [gr("allman_overtid_ar", varsta)], notiser: [], restidSaknas: false });

  it("ingen närmar sig: en 'stämmer'-rad, inga saker, ingen förare i listan", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Anna", "lugn")], varningar: [] });
    const r = byggAttGora(i, "2026-10-13");
    expect(r.saker).toEqual([]);
    expect(r.arbetstid).toEqual([]);
    expect(r.stammer.find(x => x.id === "arbetstid")).toMatchObject({ rubrik: "Ingen nära eller över en gräns för arbetstid" });
  });

  it("bara gula: 'nära gränsen' visas ENSAM (varna före gränsen) — ingen röd behövs, och ingen 'stämmer'-rad", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Gul", "gul"), forare("Lugn", "lugn")], varningar: [] });
    const r = byggAttGora(i, "2026-10-13");
    expect(r.arbetstid.map(f => f.namn)).toEqual(["Gul"]);
    expect(r.stammer.find(x => x.id === "arbetstid")).toBeUndefined();
  });

  it("gula och röda förare kommer med, röda först — och då finns ingen 'stämmer'-rad", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Gul", "gul"), forare("Lugn", "lugn"), forare("Röd", "rod")], varningar: [] });
    const r = byggAttGora(i, "2026-10-13");
    expect(r.arbetstid.map(f => f.namn)).toEqual(["Röd", "Gul"]);
    expect(r.stammer.find(x => x.id === "arbetstid")).toBeUndefined();
  });

  it("bara delägare är gula/röda: de visas inte alls (arbetstidslagen gäller inte) och 'Ingen över en gräns' står under Stämmer", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Martin", "rod", true), forare("Joacim", "gul", true), forare("Anna", "lugn")], varningar: [] });
    const r = byggAttGora(i, "2026-10-13");
    expect(r.arbetstid).toEqual([]);
    expect(r.stammer.find(x => x.id === "arbetstid")).toMatchObject({ rubrik: "Ingen nära eller över en gräns för arbetstid" });
  });

  it("delägare bredvid en vanlig röd förare: bara den röda visas, och ingen 'stämmer'-rad", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Martin", "rod", true), forare("Stefan", "rod")], varningar: [] });
    const r = byggAttGora(i, "2026-10-13");
    expect(r.arbetstid.map(f => f.namn)).toEqual(["Stefan"]);
    expect(r.stammer.find(x => x.id === "arbetstid")).toBeUndefined();
  });

  it("läsvarningar (frånvaro, avtal, utjämning) följer med så att kortet kan visa dem", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [], varningar: ["Kunde inte läsa frånvaron (x)"] });
    expect(byggAttGora(i, "2026-10-13").arbetstidVarningar).toEqual(["Kunde inte läsa frånvaron (x)"]);
  });

  it("en källa som inte gick att läsa är en sak, inte 'ingen närmar sig'", () => {
    const i = lugnt(); i.arbetstid = { data: null, fel: "HTTP 500" };
    const r = byggAttGora(i, "2026-10-13");
    expect(r.saker).toHaveLength(1);
    expect(r.saker[0]).toMatchObject({ rubrik: "Kunde inte kontrollera arbetstiden", detalj: "HTTP 500", mal: { typ: "forsok" } });
    expect(r.stammer.find(x => x.id === "arbetstid")).toBeUndefined();
  });

  it("den gamla raden 'har X tim övertid i år, taket är 250' (vid 200 tim) finns inte längre — det nya kortet är enda källan", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Stefan", "gul")], varningar: [] });
    expect(byggAttGora(i, "2026-10-13").saker.some(x => x.id.startsWith("arsovertid-"))).toBe(false);
  });
});
