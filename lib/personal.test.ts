import { describe, it, expect } from "vitest";
import {
  antalAttGora, egnaUppgifterText, matAttTankaPa, grupperaPaRoll, ledighetText, periodText, personStatus, utbildningStatus,
  type Person, type PersonUtbildning,
} from "./personal";

const NU = new Date(2026, 10, 1, 12, 0); // söndag 1 november 2026, lokal tid

function person(over: Partial<Person> = {}): Person {
  return {
    id: "p1", namn: "Stefan Nilsson", roll: "forare", maskin_namn: "Scorpion",
    telefon: "070-1", anhorig_namn: "Anna", anhorig_telefon: "070-2", anhorig_relation: "fru",
    utbildning: [], ledighet: null, ...over,
  };
}
const utb = (namn: string, status: PersonUtbildning["status"], kravtyp: PersonUtbildning["kravtyp"] = "bestallare", giltig_till: string | null = null): PersonUtbildning =>
  ({ namn, status, kravtyp, giltig_till });

describe("personStatus — EN text per rad, i prioritetsordning", () => {
  it("nåbar före behörig: saknar båda", () => {
    expect(personStatus(person({ telefon: null, anhorig_telefon: null, utbildning: [utb("HLR", "utgangen")] }), NU))
      .toEqual({ text: "Saknar telefon och anhörig", atgard: true });
  });
  it("anhörig före telefon före utbildning", () => {
    expect(personStatus(person({ anhorig_telefon: "" }), NU)?.text).toBe("Saknar anhörig");
    expect(personStatus(person({ telefon: "  " }), NU)?.text).toBe("Saknar telefon");
  });
  it("ett anhörignamn utan nummer räknas som saknad anhörig — det går inte att ringa ett namn", () => {
    expect(personStatus(person({ anhorig_namn: "Anna", anhorig_telefon: null }), NU)?.text).toBe("Saknar anhörig");
  });
  it("utbildning före ledighet", () => {
    const p = person({ utbildning: [utb("HLR", "saknas")], ledighet: { typ: "semester", startdatum: "2026-11-02", slutdatum: "2026-11-06" } });
    expect(personStatus(p, NU)).toEqual({ text: "HLR saknas", atgard: true });
  });
  it("ledighet inom 14 dagar är information, inte åtgärd", () => {
    const p = person({ ledighet: { typ: "semester", startdatum: "2026-11-03", slutdatum: "2026-11-07" } });
    expect(personStatus(p, NU)).toEqual({ text: "Semester 3–7 november", atgard: false });
  });
  it("ledighet längre fram än 14 dagar nämns inte i listan", () => {
    const p = person({ ledighet: { typ: "semester", startdatum: "2026-11-16", slutdatum: "2026-11-20" } });
    expect(personStatus(p, NU)).toBeNull();
  });
  it("allt i ordning → ingenting", () => {
    expect(personStatus(person({ utbildning: [utb("HLR", "giltig", "bestallare", "2030-01-01")] }), NU)).toBeNull();
  });
});

describe("utbildningStatus", () => {
  it("inga krav → null (ingen rad som påstår 'allt giltigt' om något som inte finns)", () => {
    expect(utbildningStatus([])).toBeNull();
  });
  it("utgången går före saknas, lagkrav före beställarkrav", () => {
    expect(utbildningStatus([utb("Grönt kort", "saknas", "certifiering"), utb("Motorsåg", "utgangen", "lag")])?.text).toBe("Motorsåg har gått ut");
    expect(utbildningStatus([utb("HLR", "saknas", "bestallare"), utb("Motorsåg", "saknas", "lag")])?.text).toBe("2 utbildningar saknas");
  });
  it("går ut snart säger månaden", () => {
    expect(utbildningStatus([utb("HLR", "gar_ut_snart", "bestallare", "2026-12-10")])).toEqual({ text: "HLR går ut i december", atgard: true });
  });
  it("allt giltigt", () => {
    expect(utbildningStatus([utb("HLR", "giltig")])).toEqual({ text: "Allt giltigt", atgard: false });
  });
});

describe("ledighetText och periodText", () => {
  it("samma månad, olika månader, en dag, annat år", () => {
    expect(periodText("2026-11-03", "2026-11-07", NU)).toBe("3–7 november");
    expect(periodText("2026-10-28", "2026-11-03", NU)).toBe("28 oktober – 3 november");
    expect(periodText("2026-11-04", "2026-11-04", NU)).toBe("4 november");
    expect(periodText("2027-01-04", "2027-01-08", NU)).toBe("4–8 januari 2027");
  });
  it("pågår och slutar i dag / senare", () => {
    expect(ledighetText({ typ: "sjuk", startdatum: "2026-11-01", slutdatum: "2026-11-01" }, NU)).toBe("Sjukdag i dag");
    expect(ledighetText({ typ: "semester", startdatum: "2026-10-30", slutdatum: "2026-11-05" }, NU)).toBe("Semester t.o.m. 5 november");
  });
  it("okänd typ heter Ledig, ingen ledighet heter Inget planerat", () => {
    expect(ledighetText({ typ: "något_nytt", startdatum: "2026-11-10", slutdatum: "2026-11-10" }, NU)).toBe("Ledig 10 november");
    expect(ledighetText(null, NU)).toBe("Inget planerat");
  });
});

describe("antalAttGora och grupperaPaRoll", () => {
  it("räknar personer, inte saker", () => {
    const lista = [
      person({ id: "a", telefon: null, anhorig_telefon: null, utbildning: [utb("HLR", "saknas")] }),
      person({ id: "b" }),
      person({ id: "c", ledighet: { typ: "semester", startdatum: "2026-11-02", slutdatum: "2026-11-02" } }),
    ];
    expect(antalAttGora(lista, NU)).toBe(1);
  });
  it("förare först, sedan admin, okänd roll sist", () => {
    const g = grupperaPaRoll([person({ id: "a", roll: "admin" }), person({ id: "b" }), person({ id: "c", roll: null })]);
    expect(g.map((x) => [x.rubrik, x.personer.map((p) => p.id)])).toEqual([["Förare", ["b"]], ["Admin", ["a"]], ["Övriga", ["c"]]]);
  });
});

describe("anställningsdatum, mat och startsidans påminnelse", () => {
  it("anställningsdatum saknas är en åtgärd efter utbildning — men bara när svaret bär fältet", () => {
    expect(personStatus(person({ anstallningsdatum: null }), NU)).toEqual({ text: "Anställningsdatum saknas", atgard: true });
    expect(personStatus(person({ anstallningsdatum: undefined }), NU)).toBeNull();
    expect(personStatus(person({ anstallningsdatum: "2020-01-01" }), NU)).toBeNull();
    expect(personStatus(person({ anstallningsdatum: null, utbildning: [utb("HLR", "saknas")] }), NU)?.text).toBe("HLR saknas");
  });
  it("mat är aldrig en åtgärd och listas bara för dem som skrivit något", () => {
    expect(personStatus(person({ mat: null }), NU)).toBeNull();
    const lista = matAttTankaPa([person({ id: "b", namn: "Örjan", mat: " laktosfri " }), person({ id: "a", namn: "Anna", mat: "vegetarian" }), person({ id: "c", mat: "" }), person({ id: "d" })]);
    expect(lista).toEqual([{ id: "a", namn: "Anna", mat: "vegetarian" }, { id: "b", namn: "Örjan", mat: "laktosfri" }]);
  });
  it("påminnelsen säger vad som saknas i ord", () => {
    expect(egnaUppgifterText({ telefon: null, anhorig_telefon: null })).toBe("Fyll i telefon och anhörig");
    expect(egnaUppgifterText({ telefon: "070", anhorig_telefon: " " })).toBe("Fyll i vem vi ringer om något händer dig");
    expect(egnaUppgifterText({ telefon: "", anhorig_telefon: "070" })).toBe("Fyll i ditt telefonnummer");
    expect(egnaUppgifterText({ telefon: "070", anhorig_telefon: "070" })).toBeNull();
  });
});
