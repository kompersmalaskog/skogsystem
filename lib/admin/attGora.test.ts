import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Datahälsas hook drar in supabase; här behövs bara tröskeln.
vi.mock("@/app/datahalsa/useDatahalsa", () => ({ LEV_GUL_DYGN: 10 }));

import { byggAttGora, avtalKraverDig, antalKraver, raknaLonLage, lonUndertext, arFlyttdagUtanForare, type AttGoraIndata } from "./attGora";
import type { ArbetstidForare, Gransstatus, Niva } from "@/lib/arbetstidsgranser";

const ok = <T,>(data: T) => ({ data, fel: null as string | null });
const lugnt = (): AttGoraIndata => ({
  kontroller: ok({ okandaOperatorer: [], forareUtanMaskin: [], saknarHempunkt: [], obekraftadHempunkt: [] } as any),
  personer: ok([{ id: "m1", namn: "Anna Berg", user_id: "u1" }]),
  maskiner: ok([{ maskin_id: "R1", visningsnamn: "H8E", modell: null, bekraftad: true, aktiv_till: null }]),
  lon: ok({ arbetsManad: "2026-09", antalKlara: 0, antalVantar: 0, antalSkickade: 2 }),
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
  it("allt som är gjort: inga rader alls — och inget som 'stämmer' (listan är bara det som ska göras)", () => {
    const r = byggAttGora(lugnt(), "2026-10-07");
    expect(r.saker).toEqual([]);
    expect(r).not.toHaveProperty("stammer");
  });

  it("en källa som fallerar är en sak, inte en nolla", () => {
    const i = lugnt(); i.vilobrott = { data: null, fel: "timeout" };
    const r = byggAttGora(i, "2026-10-07");
    expect(r.saker).toHaveLength(1);
    expect(r.saker[0]).toMatchObject({ rubrik: "Kunde inte kontrollera vilobrott", detalj: "timeout", mal: { typ: "forsok" } });
  });

  it("lönen som inte går att läsa är en sak med Försök igen — aldrig 'ingen lönerad'", () => {
    const i = lugnt(); i.lon = { data: null, fel: "permission denied" };
    const r = byggAttGora(i, "2026-10-07");
    expect(r.saker).toHaveLength(1);
    expect(r.saker[0]).toMatchObject({ id: "fel-lon", rubrik: "Kunde inte kontrollera lönen", detalj: "permission denied", knapp: "Försök igen", mal: { typ: "forsok" } });
  });

  it("dagar som väntar på bekräftelse är inte längre en rad i Översikten", () => {
    const i = lugnt() as any; i.obekraftade = ok([{ medarbetare_id: "m1", datum: "2026-09-04" }]);
    expect(byggAttGora(i, "2026-10-07").saker.some(x => x.id === "dagar")).toBe(false);
  });

  describe("lönen: EN rad, 'N klara · M väntar på föraren'", () => {
    const med = (l: Partial<AttGoraIndata["lon"]["data"] & object>) => { const i = lugnt(); i.lon = ok({ arbetsManad: "2026-09", antalKlara: 0, antalVantar: 0, antalSkickade: 0, ...l }); return byggAttGora(i, "2026-10-07").saker.filter(x => x.id === "lon"); };
    it("klara och väntande: rubrik med månaden, undertexten med båda talen, leder till Löneunderlag", () => {
      const [s] = med({ antalKlara: 3, antalVantar: 2 });
      expect(s).toMatchObject({ rubrik: "Lönen för september", detalj: "3 klara · 2 väntar på föraren", mal: { typ: "flik", flik: "lon", underflik: "underlag" } });
    });
    it("bara väntande: ingen '0 klara'", () => { expect(med({ antalVantar: 2 })[0].detalj).toBe("2 väntar på föraren"); });
    it("bara klara: ingen '0 väntar'", () => { expect(med({ antalKlara: 1 })[0].detalj).toBe("1 klar"); });
    it("allt skickat → ingen rad (inte heller 'skickad till Fortnox')", () => { expect(med({ antalSkickade: 4 })).toEqual([]); });
    it("ingen förare med dagar → ingen rad", () => { expect(med({})).toEqual([]); });
    it("lonUndertext: delar som är noll skrivs inte", () => {
      expect(lonUndertext({ antalKlara: 0, antalVantar: 0 })).toBe("");
      expect(lonUndertext({ antalKlara: 5, antalVantar: 1 })).toBe("5 klara · 1 väntar på föraren");
    });
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

  describe("vilobrott: EN rad — vem och vilka dagar ligger bakom trycket", () => {
    const b = (medarbetare_id: string, namn: string, typ: string, datum: string, svar: string | null) => ({ medarbetare_id, namn, typ, datum, vila_h: 8.5, krav_h: 11, svar, vecka: 40, år: 2026, beskrivning: "" }) as any;
    it("flera brott hos flera personer: en rad 'Vilobrott', antalet som undertext, ingen namn- eller datumlista", () => {
      const i = lugnt();
      i.vilobrott = ok([b("m1", "Anna Berg", "dygnsvila", "2026-09-29", null), b("m1", "Anna Berg", "veckovila", "2026-09-29", "Akut situation"), b("m1", "Anna Berg", "dygnsvila", "2026-09-20", null), b("m2", "Erik Lind", "dygnsvila", "2026-09-22", null)]);
      const rader = byggAttGora(i, "2026-10-07").saker.filter(s => s.id.startsWith("vila"));
      expect(rader).toHaveLength(1);
      expect(rader[0]).toMatchObject({ id: "vila", rubrik: "Vilobrott", detalj: "3 obesvarade" });
      expect(`${rader[0].rubrik} ${rader[0].detalj}`).not.toMatch(/Anna|Erik|sep|dygnsvila|\d+ h/);
      // flera personer → listan över vem
      expect(rader[0].mal).toEqual({ typ: "vilobrott" });
    });
    it("bara en person: raden går rakt till hennes dagar", () => {
      const i = lugnt();
      i.vilobrott = ok([b("m1", "Anna Berg", "dygnsvila", "2026-09-29", null)]);
      const s = byggAttGora(i, "2026-10-07").saker.find(x => x.id === "vila")!;
      expect(s.detalj).toBe("1 obesvarat");
      expect(s.mal).toEqual({ typ: "vilobrott", medarbetare_id: "m1" });
    });
    it("alla besvarade → ingen rad", () => {
      const i = lugnt(); i.vilobrott = ok([b("m1", "Anna Berg", "dygnsvila", "2026-09-29", "Akut")]);
      expect(byggAttGora(i, "2026-10-07").saker.some(x => x.id === "vila")).toBe(false);
    });
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

  it("ordningen: lön, vilobrott och arbetstid överst — sedan resten", () => {
    const i = lugnt();
    i.maskiner = ok([{ maskin_id: "R9", visningsnamn: null, modell: "H8E", bekraftad: false, aktiv_till: null }]);
    i.avtal = ok({ giltigt_till: "2026-09-30" });
    i.lon = ok({ arbetsManad: "2026-09", antalKlara: 1, antalVantar: 1, antalSkickade: 0 });
    i.vilobrott = ok([{ medarbetare_id: "m1", namn: "Anna", typ: "dygnsvila", datum: "2026-09-29", vila_h: 8.5, krav_h: 11, svar: null, vecka: 40, år: 2026, beskrivning: "" } as any]);
    i.arbetstid = ok({ forare: [{ medarbetare_id: "s", namn: "S", varsta: "gul", foretagsledare: false, granser: [], notiser: [], restidSaknas: false } as any], varningar: [] });
    expect(byggAttGora(i, "2026-10-07").saker.map(s => s.id)).toEqual(["lon", "vila", "arbetstid", "maskin-R9", "avtal"]);
  });
});

describe("raknaLonLage: klara = förarens godkännande, väntar = inget godkännande, skickade vinner", () => {
  const bas = { arbetsManad: "2026-09", medDagar: ["a", "b", "c", "d", "d"], foretagsledare: [] as string[], underlag: [] as { medarbetare_id: string; status: string | null }[], skickade: [] as string[] };
  it("godkänd → klar; inget godkännande, NULL status eller okänd status → väntar", () => {
    const l = raknaLonLage({ ...bas, underlag: [{ medarbetare_id: "a", status: "godkand_av_forare" }, { medarbetare_id: "b", status: "inskickat" }, { medarbetare_id: "c", status: null }] });
    expect(l).toEqual({ arbetsManad: "2026-09", antalKlara: 2, antalVantar: 2, antalSkickade: 0 });   // d: ingen rad alls
  });
  it("skickad räknas som skickad även om godkännandet finns kvar, och aldrig som klar", () => {
    const l = raknaLonLage({ ...bas, underlag: [{ medarbetare_id: "a", status: "godkand_av_forare" }], skickade: ["a"] });
    expect(l).toMatchObject({ antalKlara: 0, antalVantar: 3, antalSkickade: 1 });
  });
  it("en förare räknas en gång även med flera dagar; en skickad som inte har dagar räknas inte", () => {
    const l = raknaLonLage({ ...bas, medDagar: ["a", "a", "a"], skickade: ["zz"] });
    expect(l).toMatchObject({ antalKlara: 0, antalVantar: 1, antalSkickade: 0 });
  });
  it("företagsledare räknas varken som klar, väntande eller skickad", () => {
    const l = raknaLonLage({ ...bas, foretagsledare: ["a", "b"], underlag: [{ medarbetare_id: "a", status: "godkand_av_forare" }], skickade: ["b"] });
    expect(l).toMatchObject({ antalKlara: 0, antalVantar: 2, antalSkickade: 0 });
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

describe("byggAttGora: arbetstid — EN rad, lagens sex gränser (lib/arbetstidsgranser) ligger i arket", () => {
  const gr = (id: Gransstatus["id"], niva: Niva): Gransstatus => ({ id, namn: id, niva, varde: 1, grans: 2, enhet: "tim", andel: 0.5, mening: "x", varfor: "§" });
  const forare = (namn: string, varsta: Niva, delagare = false): ArbetstidForare => ({ medarbetare_id: namn, namn, varsta: delagare ? "lugn" : varsta, foretagsledare: delagare, ...(delagare ? { skulleVarit: varsta } : {}), granser: [gr("allman_overtid_ar", varsta)], notiser: [], restidSaknas: false });
  const rad = (i: AttGoraIndata) => byggAttGora(i, "2026-10-13").saker.filter(x => x.id === "arbetstid");

  it("ingen närmar sig: ingen rad, ingen förare i listan", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Anna", "lugn")], varningar: [] });
    expect(rad(i)).toEqual([]);
    expect(byggAttGora(i, "2026-10-13").arbetstid).toEqual([]);
  });

  it("bara gula: 'N förare nära arbetstidsgränsen' — varna FÖRE gränsen — utan undertext, öppnar arket", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Gul", "gul"), forare("Gul2", "gul"), forare("Lugn", "lugn")], varningar: [] });
    expect(rad(i)).toEqual([{ id: "arbetstid", rubrik: "2 förare nära arbetstidsgränsen", detalj: undefined, knapp: "Öppna", mal: { typ: "arbetstid" }, raknas: false }]);
    expect(byggAttGora(i, "2026-10-13").arbetstid.map(f => f.namn)).toEqual(["Gul", "Gul2"]);
  });

  it("en förare: '1 förare nära …' (ingen annan böjning)", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Gul", "gul")], varningar: [] });
    expect(rad(i)[0].rubrik).toBe("1 förare nära arbetstidsgränsen");
  });

  it("röda: räknas i samma tal, och undertexten säger hur många som är över (ordet bär meningen, inte färgen)", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Gul", "gul"), forare("Lugn", "lugn"), forare("Röd", "rod")], varningar: [] });
    const r = byggAttGora(i, "2026-10-13");
    expect(r.arbetstid.map(f => f.namn)).toEqual(["Röd", "Gul"]);   // röda först i arket
    expect(rad(i)[0]).toMatchObject({ rubrik: "2 förare nära arbetstidsgränsen", detalj: "1 över gränsen" });
  });

  it("delägare räknas aldrig: bara delägare gula/röda → ingen rad; bredvid en vanlig röd räknas bara den", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Martin", "rod", true), forare("Joacim", "gul", true), forare("Anna", "lugn")], varningar: [] });
    expect(rad(i)).toEqual([]);
    expect(byggAttGora(i, "2026-10-13").arbetstid).toEqual([]);
    i.arbetstid = ok({ forare: [forare("Martin", "rod", true), forare("Stefan", "rod")], varningar: [] });
    expect(rad(i)[0]).toMatchObject({ rubrik: "1 förare nära arbetstidsgränsen", detalj: "1 över gränsen" });
  });

  describe("vad som räknas i siffran (menyn och rubriken): gul syns men räknas inte, röd räknas", () => {
    it("bara gula: raden finns men raknas === false och antalet som kräver åtgärd är 0", () => {
      const i = lugnt(); i.arbetstid = ok({ forare: [forare("Gul", "gul"), forare("Gul2", "gul")], varningar: [] });
      const r = byggAttGora(i, "2026-10-13");
      expect(r.saker).toHaveLength(1);
      expect(r.saker[0].raknas).toBe(false);
      expect(antalKraver(r.saker)).toBe(0);
    });
    it("en röd bland gula: raden räknas som EN (inte som antalet förare)", () => {
      const i = lugnt(); i.arbetstid = ok({ forare: [forare("Gul", "gul"), forare("Röd", "rod"), forare("Röd2", "rod")], varningar: [] });
      const r = byggAttGora(i, "2026-10-13");
      expect(rad(i)[0].raknas).toBeUndefined();
      expect(antalKraver(r.saker)).toBe(1);
    });
    it("exakt EN röd förare räknas (gränsen går vid över = 1, inte 2)", () => {
      const i = lugnt(); i.arbetstid = ok({ forare: [forare("Röd", "rod")], varningar: [] });
      expect(antalKraver(byggAttGora(i, "2026-10-13").saker)).toBe(1);
    });
    it("gul + något annat som kräver åtgärd: bara det andra räknas", () => {
      const i = lugnt();
      i.arbetstid = ok({ forare: [forare("Gul", "gul")], varningar: [] });
      i.avtal = ok({ giltigt_till: "2026-09-30" });
      const r = byggAttGora(i, "2026-10-13");
      expect(r.saker.map(s => s.id)).toEqual(["arbetstid", "avtal"]);
      expect(antalKraver(r.saker)).toBe(1);
    });
    it("ett läsfel i arbetstiden räknas (det är inte 'nära', det är okänt)", () => {
      const i = lugnt(); i.arbetstid = ok({ forare: [], varningar: ["Kunde inte läsa frånvaron (x) — räknas utan den."] });
      expect(antalKraver(byggAttGora(i, "2026-10-13").saker)).toBe(1);
      i.arbetstid = { data: null, fel: "HTTP 500" };
      expect(antalKraver(byggAttGora(i, "2026-10-13").saker)).toBe(1);
    });
    it("alla andra rader räknas (lön, vilobrott, personer …)", () => {
      const i = lugnt();
      i.lon = ok({ arbetsManad: "2026-09", antalKlara: 1, antalVantar: 1, antalSkickade: 0 });
      i.vilobrott = ok([{ medarbetare_id: "m1", namn: "Anna", typ: "dygnsvila", datum: "2026-09-29", vila_h: 8.5, krav_h: 11, svar: null, vecka: 40, år: 2026, beskrivning: "" } as any]);
      const r = byggAttGora(i, "2026-10-13");
      expect(r.saker.every(s => s.raknas === undefined)).toBe(true);
      expect(antalKraver(r.saker)).toBe(2);
    });
  });

  it("ingen rad namnger en förare eller en gräns", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Stefan", "rod")], varningar: [] });
    expect(JSON.stringify(rad(i))).not.toMatch(/Stefan|allman_overtid/);
  });

  describe("varningar", () => {
    const FLYTT = "2 flyttdagar kunde inte kopplas till en förare (saknar medarbetare och namnet matchar ingen) och ingår inte.";
    const LAS = "Kunde inte läsa frånvaron (x) — övertid och 48-timmarssnittet räknas utan den och kan vara för låga.";
    it("flyttdagar som inte kunde kopplas ger ALDRIG en rad i Översikten (men följer med till arket)", () => {
      const i = lugnt(); i.arbetstid = ok({ forare: [], varningar: [FLYTT] });
      expect(rad(i)).toEqual([]);
      expect(byggAttGora(i, "2026-10-13").arbetstidVarningar).toEqual([FLYTT]);
    });
    it("…och inte heller när någon är nära gränsen: raden är densamma, flyttvarningen ändrar ingenting på den", () => {
      const i = lugnt(); i.arbetstid = ok({ forare: [forare("Gul", "gul")], varningar: [FLYTT] });
      expect(rad(i)[0]).toMatchObject({ rubrik: "1 förare nära arbetstidsgränsen", detalj: undefined });
    });
    it("ett läsfel som gör talen för låga är inte 'ingen närmar sig': raden finns, och arket visar varningen", () => {
      const i = lugnt(); i.arbetstid = ok({ forare: [], varningar: [LAS] });
      expect(rad(i)).toEqual([{ id: "arbetstid", rubrik: "Arbetstiden kunde inte kontrolleras helt", knapp: "Öppna", mal: { typ: "arbetstid" } }]);
      expect(byggAttGora(i, "2026-10-13").arbetstidVarningar).toEqual([LAS]);
    });
    it("arFlyttdagUtanForare känner igen servrarnas text (1 och flera) men ingen läsvarning", () => {
      expect(arFlyttdagUtanForare("1 flyttdag kunde inte kopplas till en förare (saknar medarbetare och namnet matchar ingen) och ingår inte.")).toBe(true);
      expect(arFlyttdagUtanForare(FLYTT)).toBe(true);
      expect(arFlyttdagUtanForare(LAS)).toBe(false);
      expect(arFlyttdagUtanForare("Kunde inte läsa maskinflytten (flyttdag: x) — flyttdagarna ingår inte, och arbetstid och vila kan vara för låga.")).toBe(false);
    });
    it("texten finns kvar i servern: ändras formuleringen där måste regexen följa med", () => {
      const k = readFileSync(join(__dirname, "../../app/api/lon/arbetstid/route.ts"), "utf8");
      const m = k.match(/varningar\.push\(`\$\{oplacerade\}[^`]*`\)/);
      expect(m, "route.ts: raden med oplacerade flyttdagar").not.toBeNull();
      expect(arFlyttdagUtanForare(m![0].replace(/\$\{oplacerade\} \$\{oplacerade === 1 \? "flyttdag kunde" : "flyttdagar kunde"\}/, "2 flyttdagar kunde"))).toBe(true);
    });
  });

  it("en källa som inte gick att läsa är en sak, inte 'ingen närmar sig'", () => {
    const i = lugnt(); i.arbetstid = { data: null, fel: "HTTP 500" };
    const r = byggAttGora(i, "2026-10-13");
    expect(r.saker).toHaveLength(1);
    expect(r.saker[0]).toMatchObject({ rubrik: "Kunde inte kontrollera arbetstiden", detalj: "HTTP 500", mal: { typ: "forsok" } });
  });

  it("den gamla raden 'har X tim övertid i år, taket är 250' (vid 200 tim) finns inte längre — det nya kortet är enda källan", () => {
    const i = lugnt(); i.arbetstid = ok({ forare: [forare("Stefan", "gul")], varningar: [] });
    expect(byggAttGora(i, "2026-10-13").saker.some(x => x.id.startsWith("arsovertid-"))).toBe(false);
  });
});
