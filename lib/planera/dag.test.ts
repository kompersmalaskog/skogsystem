import { describe, it, expect } from "vitest";
import {
  delarFranRader, klippDel, flyttaGrans, stappaDel, taBortDel, bytTyp, andraDel, arbetadMin, harRast, behovFragaRast,
  valideraDelar, skrivplan, ordnaSkrivningar, nyNyckel, traktForNyDel, type DagDel,
} from "./dag";
import type { PeriodRad } from "./logik";

const m = (h: number, min = 0) => h * 60 + min;
const del = (o: Partial<DagDel> & { start: number; slut: number }): DagDel => ({
  nyckel: `n:${Math.random().toString(36).slice(2, 6)}`, radId: null, typ: "planering", objektId: "T1", deb: true, kommentar: "", last: false, ...o,
});
const rad = (o: Partial<PeriodRad> & { id: string; start_tid: string; slut_tid: string | null }): PeriodRad => ({
  datum: "2026-10-02", minuter: null, aktivitet_typ: "planering", objekt_id: "T1", debiterbar: true, ...o,
});
const NU = new Date(2026, 9, 2, 17, 0);

// En hel dag som en enda planering, som när man glömt byta: 07:00–16:00 på Odenssvalahult (T1)
const dag0 = () => [del({ nyckel: "r:p", radId: "p", start: m(7), slut: m(16) })];

describe("klipp upp dagen — Martins fall", () => {
  it("planering 07–16 → klipp 10:00 (rast), 10:30 (manuellt), 13:00 (manuellt på Betet) → fyra delar, arbetad tid 8 tim 30", () => {
    let d: DagDel[] | null = dag0();
    d = klippDel(d, "r:p", m(10), { typ: "rast" });
    expect(d!.map(x => [x.typ, x.start, x.slut])).toEqual([["planering", m(7), m(10)], ["rast", m(10), m(16)]]);
    d = klippDel(d!, d![1].nyckel, m(10, 30), { typ: "manuellt" });
    d = klippDel(d!, d![2].nyckel, m(13), { typ: "manuellt", objektId: "T2" });
    expect(d).toHaveLength(4);
    expect(d!.map(x => [x.typ, x.objektId, x.start, x.slut])).toEqual([
      ["planering", "T1", m(7), m(10)],
      ["rast", null, m(10), m(10, 30)],
      ["manuellt", null, m(10, 30), m(13)],       // objektId ärvs från delen som klipptes — här rasten (null)
      ["manuellt", "T2", m(13), m(16)],
    ]);
    expect(arbetadMin(d!)).toBe(8 * 60 + 30);
    expect(harRast(d!)).toBe(true);
  });
  it("den nya delen ärver trakt från delen som klipps, fakturering följer aktiviteten, första halvan behåller raden", () => {
    const d = klippDel(dag0(), "r:p", m(10), { typ: "restid" })!;
    expect(d[0]).toMatchObject({ radId: "p", typ: "planering", slut: m(10) });
    expect(d[1]).toMatchObject({ radId: null, typ: "restid", objektId: "T1", deb: false, start: m(10), slut: m(16) });
    expect(klippDel(dag0(), "r:p", m(10), { typ: "markagare" })![1].deb).toBe(true);
  });
  it("klipp utanför delen eller i en låst del går inte", () => {
    expect(klippDel(dag0(), "r:p", m(7), { typ: "rast" })).toBeNull();
    expect(klippDel(dag0(), "r:p", m(16), { typ: "rast" })).toBeNull();
    expect(klippDel([del({ nyckel: "x", start: m(7), slut: m(16), last: true })], "x", m(10), { typ: "rast" })).toBeNull();
  });
});

describe("ändra delar", () => {
  const fyra = () => {
    const a = del({ nyckel: "a", start: m(7), slut: m(10) });
    const r = del({ nyckel: "r", typ: "rast", objektId: null, deb: false, start: m(10), slut: m(10, 30) });
    const b = del({ nyckel: "b", typ: "manuellt", start: m(10, 30), slut: m(13) });
    const c = del({ nyckel: "c", typ: "manuellt", objektId: "T2", start: m(13), slut: m(16) });
    return [a, r, b, c];
  };
  it("gränsen flyttar med grannen — inga hål eller krockar", () => {
    const d = flyttaGrans(fyra(), 0, m(10, 15))!;
    expect(d[0].slut).toBe(m(10, 15));
    expect(d[1].start).toBe(m(10, 15)); // rasten blir kortare, inget hål
    expect(flyttaGrans(fyra(), 0, m(10, 30))).toBeNull(); // rasten skulle bli 0 min
    expect(flyttaGrans(fyra(), 3, m(15))).toBeNull();     // sista delen har ingen granne efter sig
  });
  it("kvartssteg på start och slut; första trycket från en icke-kvart snappar till kvarten", () => {
    const d = stappaDel(fyra(), 2, "slut", 1, m(17))!;
    expect(d[2].slut).toBe(m(13, 15));
    expect(d[3].start).toBe(m(13, 15));
    const s = [del({ start: m(7, 34), slut: m(16, 52) })];
    expect(stappaDel(s, 0, "start", -1, m(17))![0].start).toBe(m(7, 30));
    expect(stappaDel(s, 0, "start", 1, m(17))![0].start).toBe(m(7, 45));
    expect(stappaDel(s, 0, "slut", -1, m(17))![0].slut).toBe(m(16, 45));
  });
  it("sista slutet får aldrig passera taket (idag: nu)", () => {
    const s = [del({ start: m(7), slut: m(16) })];
    expect(stappaDel(s, 0, "slut", 1, m(16))).toBeNull();
    expect(stappaDel(s, 0, "slut", 1, m(16, 15))![0].slut).toBe(m(16, 15));
  });
  it("byt typ (arbete ↔ rast) och ändra trakt/fakturering/kommentar", () => {
    let d = bytTyp(fyra(), "b", "rast");
    expect(d.map(x => x.typ)).toEqual(["planering", "rast", "manuellt"]);
    expect(d.find(x => x.typ === "rast")).toMatchObject({ start: m(10), slut: m(13) }); // rasten + den nya rastdelen slås ihop till en
    d = andraDel(fyra(), "c", { objektId: "T3", deb: false, kommentar: "Ny trakt" });
    expect(d[3]).toMatchObject({ objektId: "T3", deb: false, kommentar: "Ny trakt" });
  });
  it("ta bort: föregående ARBETSdel tar över tiden — aldrig en rast; annars nästa; annars blir den rast", () => {
    const b = taBortDel(fyra(), "b")!;
    expect(b.map(x => x.nyckel)).toEqual(["a", "r", "c"]);
    // b låg efter rasten → föregående del är en RAST, inte arbete → nästa arbetsdel (c) tar över
    expect(b.find(x => x.nyckel === "c")).toMatchObject({ start: m(10, 30), slut: m(16) });
    const c = taBortDel(fyra(), "c")!; // c:s föregående är b (arbete) → b växer
    expect(c.find(x => x.nyckel === "b")).toMatchObject({ start: m(10, 30), slut: m(16) });
    const a = taBortDel(fyra(), "a")!; // a är först, nästa är rast → ingen arbetsgranne → a blir rast (och slås ihop med rasten)
    expect(a[0]).toMatchObject({ typ: "rast", start: m(7), slut: m(10, 30) });
    expect(a).toHaveLength(3);
  });
  it("tar man bort den enda delen blir resultatet tomt (hela perioden tas bort)", () => {
    expect(taBortDel(dag0(), "r:p")).toEqual([]);
  });
});

describe("trakt för en ny del", () => {
  it("ärver delen som klipps; är den en rast används närmaste arbetsdels trakt", () => {
    const d = [del({ nyckel: "a", objektId: "T1", start: m(7), slut: m(10) }), del({ nyckel: "r", typ: "rast", objektId: null, start: m(10), slut: m(16) })];
    expect(traktForNyDel(d, "a")).toBe("T1");
    expect(traktForNyDel(d, "r")).toBe("T1");
    expect(traktForNyDel([del({ nyckel: "r", typ: "rast", objektId: null, start: m(7), slut: m(8) })], "r")).toBeNull();
  });
});

describe("rast: ingen gissning", () => {
  it("fråga 'Hade du rast?' bara när dagen är längre än 5 tim och ingen rast finns", () => {
    expect(behovFragaRast(dag0())).toBe(true);                                   // 07–16, ingen rast
    expect(behovFragaRast([del({ start: m(7), slut: m(12) })])).toBe(false);     // exakt 5 tim
    expect(behovFragaRast([del({ start: m(7), slut: m(12, 15) })])).toBe(true);  // 5 tim 15 min
    expect(behovFragaRast([del({ start: m(7), slut: m(10) }), del({ typ: "rast", start: m(10), slut: m(10, 30) }), del({ start: m(10, 30), slut: m(16) })])).toBe(false);
    expect(behovFragaRast([del({ start: m(7), slut: m(10) })])).toBe(false);
  });
});

describe("rader ↔ delar", () => {
  const rader = [
    rad({ id: "p1", start_tid: "07:00:00", slut_tid: "10:00:00" }),
    rad({ id: "p2", start_tid: "10:30:00", slut_tid: "13:00:00", aktivitet_typ: "manuellt" }),
    rad({ id: "s1", start_tid: "13:00:00", slut_tid: "14:00:00", aktivitet_typ: "service", objekt_id: null }),
    rad({ id: "p3", start_tid: "19:00:00", slut_tid: "20:00:00" }),
  ];
  it("luckor mellan rader blir rast (≤ 3 tim) eller låst 'lucka'; rader Planera inte hanterar blir låsta", () => {
    const d = delarFranRader(rader);
    expect(d.map(x => [x.typ, x.start, x.slut, x.last])).toEqual([
      ["planering", m(7), m(10), false],
      ["rast", m(10), m(10, 30), false],
      ["manuellt", m(10, 30), m(13), false],
      ["service", m(13), m(14), true],          // låst
      ["lucka", m(14), m(19), true],            // 5 tim lucka: inte en rast
      ["planering", m(19), m(20), false],
    ]);
  });
  it("skrivplan: bara det som ändrats — rast och luckor ger inga rader, låsta rader rörs aldrig", () => {
    const d = delarFranRader(rader);
    expect(skrivplan(rader, d)).toEqual({ radera: [], uppdatera: [], infoga: [] });
    const e = flyttaGrans(d, 0, m(10, 15))!; // p1 slutar 10:15 (rasten krymper)
    expect(skrivplan(rader, e).uppdatera.map(u => u.id)).toEqual(["p1"]);
    const f = bytTyp(d, "r:p2", "rast"); // p2 blir rast → raden raderas
    expect(skrivplan(rader, f).radera).toEqual(["p2"]);
    const g = taBortDel(d, "r:p3");     // p3 har låst granne (lucka) → blir rast → raden raderas
    expect(skrivplan(rader, g!).radera).toEqual(["p3"]);
    expect(skrivplan(rader, d.filter(x => x.nyckel !== "r:s1")).radera).not.toContain("s1"); // service rörs aldrig
  });
  it("klipp ger en infogning; kommentar/fakturering/trakt-ändringar ger en uppdatering", () => {
    const d = klippDel(delarFranRader([rader[0]]), "r:p1", m(8, 30), { typ: "manuellt" })!;
    const plan = skrivplan([rader[0]], d);
    expect(plan.infoga).toHaveLength(1);
    expect(plan.infoga[0]).toMatchObject({ typ: "manuellt", start: m(8, 30), slut: m(10) });
    expect(plan.uppdatera.map(u => u.id)).toEqual(["p1"]);
    expect(skrivplan(rader, andraDel(delarFranRader(rader), "r:p1", { kommentar: "x" })).uppdatera.map(u => u.id)).toEqual(["p1"]);
  });
  it("ordning: en rad som ska växa in i tid en annan lämnar väntar på den; raderingar först", () => {
    const rs = [rad({ id: "a", start_tid: "07:00:00", slut_tid: "10:00:00" }), rad({ id: "b", start_tid: "10:00:00", slut_tid: "13:00:00" })];
    // a växer till 11:00 och b börjar 11:00 (gränsen flyttas +1 tim)
    const d = flyttaGrans(delarFranRader(rs), 0, m(11))!;
    const ordning = ordnaSkrivningar(rs, skrivplan(rs, d))!;
    expect(ordning.map(o => (o.typ === "uppdatera" ? o.id : o.typ))).toEqual(["b", "a"]); // b krymper först, sedan får a växa
    // gränsen flyttas åt andra hållet → a krymper först
    const d2 = flyttaGrans(delarFranRader(rs), 0, m(9))!;
    expect(ordnaSkrivningar(rs, skrivplan(rs, d2))!.map(o => (o.typ === "uppdatera" ? o.id : o.typ))).toEqual(["a", "b"]);
  });
  it("nyNyckel ger alltid en ledig nyckel", () => {
    expect(nyNyckel([])).toBe("n:1");
    expect(nyNyckel([del({ nyckel: "n:1", start: 0, slut: 1 })])).toBe("n:2");
  });
});

describe("kontroller före sparande", () => {
  const pass = { start_tid: "09:00:00", slut_tid: "12:00:00" };
  const ingenPass = { start_tid: null, slut_tid: null };
  it("inte efter nu, inte inne i eller korsande maskinpass, trakt krävs", () => {
    const igar = "2026-10-01";
    expect(valideraDelar([del({ start: m(7), slut: m(8) })], { datum: igar, pass: ingenPass, nu: NU })).toBeNull();
    expect(valideraDelar([del({ start: m(18), slut: m(19) })], { datum: "2026-10-02", pass: ingenPass, nu: NU })).toMatch(/framtiden/);
    expect(valideraDelar([del({ start: m(10), slut: m(11) })], { datum: igar, pass, nu: NU })).toMatch(/inom maskinpasset \(09:00–12:00\)/);
    expect(valideraDelar([del({ start: m(8), slut: m(10) })], { datum: igar, pass, nu: NU })).toMatch(/korsar maskinpassets gräns/);
    expect(valideraDelar([del({ start: m(7), slut: m(8), objektId: null })], { datum: igar, pass: ingenPass, nu: NU })).toMatch(/Välj trakt/);
  });
  it("rast och låsta delar kontrolleras inte", () => {
    expect(valideraDelar([del({ typ: "rast", objektId: null, start: m(10), slut: m(10, 30) }), del({ last: true, typ: "service", start: m(11), slut: m(12) })],
      { datum: "2026-10-01", pass, nu: NU })).toBeNull();
  });
});
