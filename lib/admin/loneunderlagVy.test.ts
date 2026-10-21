import { describe, it, expect } from "vitest";
import { byggForarKort, saknarAnstallningsdatum, antalAttKolla, dagText, arKvitterbar, SYNK_VISA_FRAN_MIN } from "./loneunderlagVy";

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

describe("Hemskickad: Admin ser antalet timmar per förare och månad, och det är betald tid (ingen att-kolla)", () => {
  it("en info-rad med timmar, dagar och vilka dagar — ingen kolla-rad, ingen 'frånvaro'", () => {
    const k = byggForarKort(forare({ hemskickad: [{ datum: "2026-08-11", minuter: 120 }, { datum: "2026-08-19", minuter: 113 }], hemskickad_h: 3.88 }));
    expect(k.info.find(r => r.id === "hemskickad")!.text).toBe("Hemskickad 3,88 tim · 2 dagar (11 aug, 19 aug) – betalas som timlön");
    expect(k.kolla).toHaveLength(0);
    expect(alltText(k)).not.toMatch(/frånvaro|Deldag/i);
  });
  it("en dag: 'dag', inte 'dagar'", () => {
    const k = byggForarKort(forare({ hemskickad: [{ datum: "2026-08-11", minuter: 120 }], hemskickad_h: 2 }));
    expect(k.info.find(r => r.id === "hemskickad")!.text).toBe("Hemskickad 2 tim · 1 dag (11 aug) – betalas som timlön");
  });
  it("ingen hemskickad: ingen rad (en tom grupp visas inte)", () => {
    expect(byggForarKort(forare({ hemskickad: [], hemskickad_h: 0 })).info.some(r => r.id === "hemskickad")).toBe(false);
    expect(byggForarKort(forare()).info.some(r => r.id === "hemskickad")).toBe(false);
  });
  it("företagsledare får ingen rad", () => {
    expect(byggForarKort(forare({ foretagsledare: true, hemskickad: [{ datum: "2026-08-11", minuter: 120 }], hemskickad_h: 2 })).info).toEqual([]);
  });
});


// ── Förarens godkännande, kvittering och minutskillnad (Martin 2026-10-21) ─────────────────────────────────────────
describe("status på förarkortet", () => {
  it("Väntar på föraren / Godkänd av föraren / Skickad, och ingen alls för en företagsledare", () => {
    expect(byggForarKort(forare({ godkannande: "vantar" })).forarStatus).toBe("vantar");
    expect(byggForarKort(forare({ godkannande: "godkand" })).forarStatus).toBe("godkand");
    expect(byggForarKort(forare({ godkannande: "vantar", status: "skickat" })).forarStatus).toBe("skickad");
    expect(byggForarKort(forare({ godkannande: "godkand", foretagsledare: true })).forarStatus).toBeNull();
  });
  it("saknat godkännande-fält (äldre svar) = väntar, aldrig godkänd", () => {
    expect(byggForarKort(forare()).forarStatus).toBe("vantar");
  });
  it("en ändring efter godkännandet bär datum och tid till kortet", () => {
    const k = byggForarKort(forare({ godkannande: "vantar", andrad_efter_godkannande: { at: "2026-10-05T08:00:00Z", datum: "2026-09-10" } }));
    expect(k.andrad).toEqual({ at: "2026-10-05T08:00:00Z", datum: "2026-09-10", text: "Ändrad efter godkännandet · 10 sep" });
  });
  it("ingen ändring → ingen text; en ändring utan känd dag skriver ändå att den är ändrad", () => {
    expect(byggForarKort(forare()).andrad).toBeNull();
    expect(byggForarKort(forare({ andrad_efter_godkannande: { at: "2026-10-05T08:00:00Z", datum: null } })).andrad!.text).toBe("Ändrad efter godkännandet");
  });
});

describe("minutskillnad mot maskinen visas bara från 15 min", () => {
  const synk = (diff_min: number, datum = "2026-08-11") => ({ medarbetare_id: "m1", datum, diff_min, bekraftat: "07:00", maskinen: "07:10" });
  it("gränsen är 15", () => expect(SYNK_VISA_FRAN_MIN).toBe(15));
  it("14 min syns inte, 15 syns, och minus räknas lika (–20)", () => {
    expect(byggForarKort(forare({ synk: [synk(14)] })).kolla).toEqual([]);
    expect(byggForarKort(forare({ synk: [synk(-14)] })).kolla).toEqual([]);
    expect(byggForarKort(forare({ synk: [synk(15)] })).kolla.map(r => r.id)).toEqual(["synk-2026-08-11"]);
    expect(byggForarKort(forare({ synk: [synk(-20)] })).kolla).toHaveLength(1);
  });
  it("de små räknas inte heller in i 'N saker att kolla'", () => {
    expect(antalAttKolla([byggForarKort(forare({ synk: [synk(5), synk(10)] }))], 0, false)).toBe(0);
  });
  it("radens id följer datumet, inte ordningen (en kvittering ska inte hoppa till en annan dag när listan ändras)", () => {
    const a = byggForarKort(forare({ synk: [synk(30, "2026-08-12"), synk(40, "2026-08-11")] }));
    expect(a.kolla.map(r => r.id)).toEqual(["synk-2026-08-12", "synk-2026-08-11"]);
  });
});

describe("kvittering av 'Att kolla' ('Ser rätt ut')", () => {
  const lang = { datum: "2026-08-11", rast_min: 114, avbrott: [] };
  const kv = (o: any = {}) => ({ medarbetare_id: "m1", punkt: "rast-2026-08-11", text: "11 aug: rast 114 min", ...o });

  it("en kvitterad punkt är markerad och räknas inte i 'N saker att kolla'", () => {
    const k = byggForarKort(forare({ rast_langa: [lang], orimliga: [] }), [], [kv()]);
    expect(k.kolla).toHaveLength(1);
    expect(k.kolla[0].kvitterad).toBe(true);
    expect(antalAttKolla([k], 0, false)).toBe(0);
  });
  it("utan kvittering är raden som förut (inget kvitterad-fält alls)", () => {
    const k = byggForarKort(forare({ rast_langa: [lang] }));
    expect(k.kolla[0]).not.toHaveProperty("kvitterad");
    expect(antalAttKolla([k], 0, false)).toBe(1);
  });
  it("ändras raden (annan text) gäller kvitteringen inte längre — den kommer tillbaka som något att kolla", () => {
    const k = byggForarKort(forare({ rast_langa: [{ ...lang, rast_min: 140 }] }), [], [kv()]);
    expect(k.kolla[0]).not.toHaveProperty("kvitterad");
    expect(antalAttKolla([k], 0, false)).toBe(1);
  });
  it("en annan förares kvittering, eller en annan punkt, gäller inte", () => {
    expect(byggForarKort(forare({ rast_langa: [lang] }), [], [kv({ medarbetare_id: "m2" })]).kolla[0]).not.toHaveProperty("kvitterad");
    expect(byggForarKort(forare({ rast_langa: [lang] }), [], [kv({ punkt: "rast-2026-08-12" })]).kolla[0]).not.toHaveProperty("kvitterad");
  });
  it("bara en av två kvitteras: den andra räknas fortfarande", () => {
    const m = forare({ rast_langa: [lang, { datum: "2026-08-12", rast_min: 120, avbrott: [] }] });
    const k = byggForarKort(m, [], [kv()]);
    expect(k.kolla.map(r => !!r.kvitterad)).toEqual([true, false]);
    expect(antalAttKolla([k], 0, false)).toBe(1);
  });
  it("det som har en riktig åtgärd går inte att kvittera: maskin utan typ och obekräftade dagar", () => {
    expect(arKvitterbar("typ-R64428")).toBe(false);
    expect(arKvitterbar("obekr")).toBe(false);
    for (const id of ["rast-2026-08-11", "orim-2026-08-12", "kort-2026-08-10", "synk-2026-08-11", "led-2026-08-11", "byte-2026-08-20"]) expect(arKvitterbar(id), id).toBe(true);
  });
  it("en kvittering på något som inte går att kvittera ignoreras (typ saknas räknas alltid)", () => {
    const k = byggForarKort(forare({ maskin_utan_typ: ["R64428"] }), [], [kv({ punkt: "typ-R64428", text: "Maskinen R64428 saknar typ — premien räknas inte" })]);
    expect(k.kolla[0]).not.toHaveProperty("kvitterad");
    expect(antalAttKolla([k], 0, false)).toBe(1);
  });
  it("företagsledare: inga rader, alltså inget att kvittera", () => {
    expect(byggForarKort(forare({ foretagsledare: true, rast_langa: [lang] }), [], [kv()]).kolla).toEqual([]);
  });
});
