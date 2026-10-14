import { describe, it, expect } from "vitest";
import { BESKED_MAX_VANTAN_MS, beskedLangd, beskedText, forvaldTyp, valjBesked, type BeskedBeslut } from "./besked";
import type { Ansokan } from "./typer";

const A = (over: Partial<Ansokan> = {}): Ansokan => ({
  id: "a-1", medarbetare_id: "m-1", anvandare_id: "Test Förare", typ: "semester",
  startdatum: "2099-11-02", slutdatum: "2099-11-06", status: "godkänd", kommentar: null, skapad_at: "2026-09-20T08:00:00Z", ...over,
});

describe("valjBesked — när visas beskedsvyn", () => {
  it("min, godkänd, och beslutet är nytt (står i serverns lista) → visas", () => {
    expect(valjBesked({ besked: "a-1", mina: [A()], nyaIds: ["a-1"] })?.id).toBe("a-1");
  });
  it("min, nekad, nytt → visas", () => {
    expect(valjBesked({ besked: "a-1", mina: [A({ status: "nekad" })], nyaIds: ["a-1"] })?.status).toBe("nekad");
  });
  it("REDAN SETT (står inte i serverns lista över nya) → ingen beskedsvy", () => {
    expect(valjBesked({ besked: "a-1", mina: [A()], nyaIds: [] })).toBeNull();
    expect(valjBesked({ besked: "a-1", mina: [A()], nyaIds: ["annan"] })).toBeNull();
  });
  it("finns inte bland MINA (borttagen eller någon annans) → ingen beskedsvy", () => {
    expect(valjBesked({ besked: "a-1", mina: [], nyaIds: ["a-1"] })).toBeNull();
    expect(valjBesked({ besked: "a-1", mina: [A({ id: "b-2" })], nyaIds: ["a-1"] })).toBeNull();
  });
  it("beslutet gäller inte längre (tillbaka till väntar) eller ansökan är registrerad → ingen beskedsvy", () => {
    expect(valjBesked({ besked: "a-1", mina: [A({ status: "väntar" })], nyaIds: ["a-1"] })).toBeNull();
    expect(valjBesked({ besked: "a-1", mina: [A({ status: "registrerad" })], nyaIds: ["a-1"] })).toBeNull();
  });
  it("ingen länkparameter → ingen beskedsvy, hur många nya beslut det än finns", () => {
    expect(valjBesked({ besked: null, mina: [A()], nyaIds: ["a-1"] })).toBeNull();
  });
  it("väntetiden är begränsad (vyn får aldrig hänga på ett svar som inte kommer)", () => {
    expect(BESKED_MAX_VANTAN_MS).toBeGreaterThan(0);
    expect(BESKED_MAX_VANTAN_MS).toBeLessThanOrEqual(10_000);
  });
});

describe("beskedText — godkänd", () => {
  const g = (over: Partial<Ansokan> = {}) => beskedText(A(over) as BeskedBeslut);
  it("semester: 'Din semester är godkänd', perioden, arbetsdagar, vänlig rad", () => {
    expect(g()).toEqual({ slag: "godkand", rubrik: "Din semester är godkänd", period: "2 – 6 november", langd: "5 arbetsdagar", hals: "Ha en skön ledighet!" });
  });
  it("ATK: timmar (8 per arbetsdag) och en saklig rad — ingen 'ha en skön'", () => {
    expect(g({ typ: "atk" })).toEqual({ slag: "godkand", rubrik: "Din ATK är godkänd", period: "2 – 6 november", langd: "40 timmar", hals: "Inlagt i kalendern." });
  });
  it("en dag: 'arbetsdag' i singular, och 'timme' för en ATK-dag är 8 timmar", () => {
    expect(g({ startdatum: "2099-11-03", slutdatum: "2099-11-03" })).toMatchObject({ period: "3 november", langd: "1 arbetsdag" });
    expect(g({ typ: "atk", startdatum: "2099-11-03", slutdatum: "2099-11-03" })).toMatchObject({ langd: "8 timmar" });
  });
  it("bytesdag och övriga typer: egen grammatik resp. 'ledighet' — aldrig en gissad", () => {
    expect(g({ typ: "inarbetad" })).toMatchObject({ rubrik: "Din inarbetade dag är godkänd", hals: "Inlagt i kalendern." });
    expect(g({ typ: "komp" })).toMatchObject({ rubrik: "Din ledighet är godkänd" });
  });
  it("period över månadsskifte", () => {
    expect(g({ startdatum: "2099-11-30", slutdatum: "2099-12-02" })).toMatchObject({ period: "30 november – 2 december" });
  });
  it("bara helgdagar → ingen längdrad (hellre ingen rad än '0 arbetsdagar')", () => {
    expect(beskedLangd({ typ: "semester", startdatum: "2099-11-07", slutdatum: "2099-11-08" })).toBeNull();
    expect(g({ startdatum: "2099-11-07", slutdatum: "2099-11-08" })).toMatchObject({ langd: null });
  });
});

describe("beskedText — nekad: stillsam, saklig", () => {
  const n = beskedText(A({ status: "nekad" }) as BeskedBeslut);
  it("en mening med datumet, och ingenting mer", () => {
    expect(n).toEqual({ slag: "nekad", rubrik: "Din ansökan 2 – 6 november gick inte igenom." });
  });
  it("ingen 'tyvärr', ingen uppmaning att prata med någon, ingen gladlynt rad", () => {
    const allt = JSON.stringify(n).toLowerCase();
    for (const ord of ["tyvärr", "prata", "kontakta", "chef", "skön", "grattis"]) expect(allt).not.toContain(ord);
  });
});

describe("forvaldTyp — typen följer med till 'Ansök om andra datum'", () => {
  it("semester och ATK förväljs; bytesdag (kräver en röd dag) och övrigt väljs om", () => {
    expect(forvaldTyp({ typ: "semester" })).toBe("semester");
    expect(forvaldTyp({ typ: "atk" })).toBe("atk");
    expect(forvaldTyp({ typ: "inarbetad" })).toBeNull();
    expect(forvaldTyp({ typ: "komp" })).toBeNull();
  });
});
