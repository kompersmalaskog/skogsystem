import { describe, it, expect } from "vitest";
import { byggForarKort, saknarAnstallningsdatum, antalAttKolla, dagText } from "./loneunderlagVy";

const forare = (extra: any = {}) => ({ medarbetare_id: "m1", namn: "Mats Eriksson", status: "utkast", anstallningsnummer: "1006", ...extra });
const alltText = (k: ReturnType<typeof byggForarKort>) => [...k.helglon, ...k.kolla.map(r => r.text), ...k.info.map(r => r.text)].join(" | ");

describe("Löneunderlaget per förare: en sak per rad, samma sak aldrig två gånger", () => {
  it("datum på ETT sätt: '11 aug'", () => {
    expect(dagText("2026-08-11")).toBe("11 aug");
    expect(dagText("2025-12-30")).toBe("30 dec");
  });

  it("dagar utan rast ger ingen varning (rast noll är info i dagens detalj, inte en rad per förare)", () => {
    const k = byggForarKort(forare({ utan_rast: { dagar: 8, timmar: 84.3, datum: ["2026-08-03"] } }));
    expect(alltText(k)).not.toMatch(/utan rast|noll rast|Skotarna loggar/i);
    expect(k.kolla).toHaveLength(0);
  });

  it("brandriskraden som upprepar lönearaden finns inte (lönearaden har timmarna)", () => {
    const k = byggForarKort(forare({ ob: { timmar: 10.3, dagar: 3, obesvarade: 0 }, brandrisk: { ob_min: 618 } }));
    expect(alltText(k)).not.toMatch(/Brandrisk|se listan ovan|en lönerad/i);
  });

  it("lång rast: en kort rad med knapp till dagen, utan paragrafcitatet", () => {
    const k = byggForarKort(forare({ rast_langa: [{ datum: "2026-08-11", rast_min: 114, avbrott: [] }] }));
    expect(k.kolla).toEqual([{ id: "rast-2026-08-11", text: "11 aug: rast 114 min", mal: { typ: "dagar" }, knapp: "Se dagen" }]);
    expect(alltText(k)).not.toMatch(/§5|Skogsavtalet|Redigera|lunch/i);
  });

  it("lång rast med stillestånd samma tid säger det kort", () => {
    const k = byggForarKort(forare({ rast_langa: [{ datum: "2026-08-11", rast_min: 114, avbrott: [{ typ: "Övrigt", kategori: "Default", minuter: 100, klockslag: "11:00" }] }] }));
    expect(k.kolla[0].text).toBe("11 aug: rast 114 min · maskinen stod still 100 min samtidigt");
  });

  it("orimligt pass och rast längre än passet: en rad var, med knapp", () => {
    const k = byggForarKort(forare({ orimliga: [{ datum: "2026-08-12", slag: "lang", arbetad_min: 1002, start_tid: "04:00:00", slut_tid: "22:00:00", rast_min: 60 }, { datum: "2026-08-13", slag: "negativ", arbetad_min: -20, start_tid: "08:00", slut_tid: "09:00", rast_min: 80 }] }));
    expect(k.kolla.map(r => r.text)).toEqual(["12 aug: passet är 16,7 tim (04:00–22:00) — stämmer det?", "13 aug: rasten är längre än passet (08:00–09:00, rast 80 min)"]);
    expect(k.kolla.every(r => r.knapp === "Se dagen")).toBe(true);
  });

  it("företagsledare: inga rader alls — varken kolla, info eller helglön", () => {
    const k = byggForarKort(forare({ foretagsledare: true, kortpass: [{ datum: "2026-08-10", minuter: 29 }], varningar: ["Frånvaro (sjuk): 1 dag(ar) 2026-08-19 — löneart för Fortnox ej fastställd; läggs INTE som lönerad, sätt manuellt innan sändning."], obekraftade: 3 }));
    expect(k.kolla).toHaveLength(0); expect(k.info).toHaveLength(0); expect(k.helglon).toHaveLength(0); expect(k.saknarAnstNr).toBe(false);
  });

  it("frånvarovarningen får svenska ord och ett datumformat (aldrig 'tjanstledig' eller 'dag(ar)')", () => {
    const k = byggForarKort(forare({ varningar: ["Frånvaro (tjanstledig): 1 dag(ar) 2025-12-30 — löneart för Fortnox ej fastställd; läggs INTE som lönerad, sätt manuellt innan sändning."] }));
    expect(k.info.map(r => r.text)).toEqual(["Tjänstledig 30 dec · ingen löneart i Fortnox, lägg in för hand"]);
  });

  it("flera frånvarodagar: antal och spann i ett kort format", () => {
    const k = byggForarKort(forare({ varningar: ["Frånvaro (sjuk): 5 dag(ar) 2026-08-03…2026-08-07 — löneart för Fortnox ej fastställd; läggs INTE som lönerad, sätt manuellt innan sändning."] }));
    expect(k.info.map(r => r.text)).toEqual(["Sjuk 5 dagar, 3 aug–7 aug · ingen löneart i Fortnox, lägg in för hand"]);
  });

  it("helglön: bara undantagen står som rader — dagar som betalar syns i lönearaden", () => {
    const k = byggForarKort(forare({ helglon: { timmar: 16, dagar: [
      { datum: "2025-12-24", namn: "Julafton", ger: true, skal: "betalas", arbetad: false },
      { datum: "2025-12-25", namn: "Juldagen", ger: false, skal: "sjuk", arbetad: false },
      { datum: "2025-12-26", namn: "Annandag jul", ger: true, skal: "betalas_arbetad", arbetad: true },
      { datum: "2025-12-31", namn: "Nyårsafton", ger: false, skal: "tjanstledig_omger", arbetad: false },
    ] } }));
    expect(k.helglon).toEqual(["25 dec Juldagen: ingen helglön — sjuk", "26 dec Annandag jul: arbetad, helglön ändå", "31 dec Nyårsafton: ingen helglön — tjänstledig dagen före/efter"]);
  });

  it("anställningsdatum saknas lyfts ur förarkortet till EN rad i svarsraden", () => {
    const m = forare({ varningar: ["Anställningsdatum saknas: kvalifikationstiden för helglön (tre månader, §10 mom 3) är inte kontrollerad. Helglönen betalas. Fyll i anställningsdatum under Medarbetare."] });
    expect(alltText(byggForarKort(m))).not.toMatch(/Anställningsdatum/);
    expect(saknarAnstallningsdatum([m, forare({ medarbetare_id: "m2", namn: "Oskar" }), { ...m, medarbetare_id: "m3", namn: "Karin", foretagsledare: true }]).map(x => x.id)).toEqual(["m1"]);
  });

  it("antalet saker att kolla: kolla-rader, saknat anst.nr, anställningsdatum (en) och kod att koppla (en)", () => {
    const a = byggForarKort(forare({ rast_langa: [{ datum: "2026-08-11", rast_min: 114, avbrott: [] }], obekraftade: 2 }));
    const b = byggForarKort(forare({ medarbetare_id: "m2", anstallningsnummer: null }));
    expect(antalAttKolla([a, b], 3, true)).toBe(2 + 1 + 1 + 1);
    expect(antalAttKolla([a, b], 0, false)).toBe(2 + 1);
  });
});
