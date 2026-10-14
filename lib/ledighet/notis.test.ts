import { describe, it, expect } from "vitest";
import { byggLedighetNotis, fornamn, arLedighetNotis, type HamtaRad, type LedighetNotisRad } from "./notis";

const RAD = (over: Partial<LedighetNotisRad> = {}): LedighetNotisRad => ({
  id: "a-1", status: "väntar", startdatum: "2026-11-03", slutdatum: "2026-11-07", namn: "Anna Svensson", ...over,
});
const finns = (rad: LedighetNotisRad | null): HamtaRad => async () => ({ rad });
const ANSOKAN = { typ: "ledighet_ansokan", payload: { ansokan_id: "a-1" } };
const BESLUT = { typ: "ledighet_beslut", payload: { ansokan_id: "a-1", status: "godkänd" } };

describe("ledighet — notis till godkännare när en ansökan skapas", () => {
  it("'{Förnamn} har ansökt om ledighet {period}', öppnar godkänn-vyn", async () => {
    const u = await byggLedighetNotis(ANSOKAN, finns(RAD()));
    expect(u).toEqual({
      typ: "skicka",
      meddelande: { title: "Ledighet", body: "Anna har ansökt om ledighet 3 – 7 november", url: "/ledighet?godkann=1", tag: "ledighet-ansokan-a-1" },
    });
  });

  it("en dag och över månadsskifte formateras som i vyn", async () => {
    const en = await byggLedighetNotis(ANSOKAN, finns(RAD({ startdatum: "2026-12-01", slutdatum: "2026-12-01" })));
    expect(en).toMatchObject({ meddelande: { body: "Anna har ansökt om ledighet 1 december" } });
    const over = await byggLedighetNotis(ANSOKAN, finns(RAD({ startdatum: "2026-12-29", slutdatum: "2027-01-02" })));
    expect(over).toMatchObject({ meddelande: { body: "Anna har ansökt om ledighet 29 december – 2 januari" } });
  });

  it("namnet saknas → 'En medarbetare' (inget gissat namn)", async () => {
    const u = await byggLedighetNotis(ANSOKAN, finns(RAD({ namn: null })));
    expect(u).toMatchObject({ meddelande: { body: "En medarbetare har ansökt om ledighet 3 – 7 november" } });
  });

  it("redan godkänd/nekad innan utskicket → hoppas över (ingen 'att godkänna' som inte stämmer)", async () => {
    for (const status of ["godkänd", "nekad"]) {
      const u = await byggLedighetNotis(ANSOKAN, finns(RAD({ status })));
      expect(u).toEqual({ typ: "hoppa_over", orsak: "Ej skickad — ansökan var redan hanterad" });
    }
  });

  it("ansökan borttagen före utskicket → hoppas över", async () => {
    expect(await byggLedighetNotis(ANSOKAN, finns(null))).toEqual({ typ: "hoppa_over", orsak: "Ej skickad — ansökan finns inte kvar" });
  });
});

describe("ledighet — notis till den anställde när godkännaren beslutar", () => {
  it("godkänd: 'Din ledighet {period} är godkänd', öppnar ledighetsvyn", async () => {
    const u = await byggLedighetNotis(BESLUT, finns(RAD({ status: "godkänd" })));
    expect(u).toEqual({
      typ: "skicka",
      meddelande: { title: "Ledighet", body: "Din ledighet 3 – 7 november är godkänd", url: "/ledighet", tag: "ledighet-beslut-a-1" },
    });
  });

  it("nekad: 'Din ledighet {period} är nekad'", async () => {
    const u = await byggLedighetNotis({ ...BESLUT, payload: { ansokan_id: "a-1", status: "nekad" } }, finns(RAD({ status: "nekad" })));
    expect(u).toMatchObject({ typ: "skicka", meddelande: { body: "Din ledighet 3 – 7 november är nekad" } });
  });

  it("texten följer ansökans status NU, inte det som stod när notisen köades", async () => {
    // köad som godkänd, men godkännaren hann ändra till nekad
    const u = await byggLedighetNotis(BESLUT, finns(RAD({ status: "nekad" })));
    expect(u).toMatchObject({ meddelande: { body: expect.stringContaining("är nekad") } });
  });

  it("ingen beslutskommentar: den anställdes egen kommentar på ansökan hamnar aldrig i notisen", async () => {
    const medKommentar = { ...RAD({ status: "nekad" }), kommentar: "Behöver ledigt för flytt" } as LedighetNotisRad;
    const u = await byggLedighetNotis(BESLUT, finns(medKommentar));
    expect(JSON.stringify(u)).not.toContain("flytt");
  });

  it("beslutet gäller inte längre (tillbaka till väntar) / ansökan borttagen → hoppas över", async () => {
    expect(await byggLedighetNotis(BESLUT, finns(RAD({ status: "väntar" })))).toEqual({ typ: "hoppa_over", orsak: "Ej skickad — beslutet gäller inte längre" });
    expect(await byggLedighetNotis(BESLUT, finns(null))).toMatchObject({ typ: "hoppa_over" });
  });
});

describe("ledighet — läsfel och trasiga rader", () => {
  it("läsfel är INTE 'finns inte': raden lämnas oskickad (uppskjut) så nästa cron försöker igen", async () => {
    const u = await byggLedighetNotis(ANSOKAN, async () => ({ rad: null, fel: "connection reset" }));
    expect(u).toEqual({ typ: "uppskjut" });
  });

  it("saknat ansokan_id → hoppas över med orsak (inget kast som välter hela flush-körningen)", async () => {
    expect(await byggLedighetNotis({ typ: "ledighet_ansokan", payload: {} }, finns(RAD()))).toMatchObject({ typ: "hoppa_over" });
    expect(await byggLedighetNotis({ typ: "ledighet_beslut", payload: null }, finns(RAD()))).toMatchObject({ typ: "hoppa_over" });
  });
});

describe("hjälpare", () => {
  it("fornamn tar första ordet, tål blanksteg och tomt", () => {
    expect(fornamn("Joacim Ringberg")).toBe("Joacim");
    expect(fornamn("  Martin   Lindqvist ")).toBe("Martin");
    expect(fornamn("")).toBe("En medarbetare");
    expect(fornamn(null)).toBe("En medarbetare");
  });
  it("arLedighetNotis känner bara de två typerna", () => {
    expect(arLedighetNotis("ledighet_ansokan")).toBe(true);
    expect(arLedighetNotis("ledighet_beslut")).toBe(true);
    expect(arLedighetNotis("dagsslut")).toBe(false);
    expect(arLedighetNotis(undefined)).toBe(false);
  });
});
