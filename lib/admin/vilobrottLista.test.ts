/**
 * Vilobrott-listan (Lön → Vilobrott och Översikten): brotten räknas om ur arbetsdag + extra_tid, förarens svar läggs på.
 * Samma regler som lagkontrollen (lib/vilobrott): veckovilans ändar är vila och ett pass över midnatt slutar nästa dygn.
 * Prod-kontrollen 2026-10-13: Oscar Ringberg 14,5 tim (ny förare), Joacim 13,3 tim (pågående vila), nattpass med 24 tim för mycket vila.
 */
import { describe, it, expect, vi } from "vitest";

// vilobrottLista drar in supabase; här behövs bara den rena uträkningen.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { beraknaVilobrottLista } from "./vilobrottLista";

const TROSKLAR = { dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };
const MED = [{ id: "o", namn: "Oscar Ringberg" }, { id: "j", namn: "Joacim" }, { id: "n", namn: "Natt" }];
const NU = new Date(2026, 9, 13, 12, 0);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dagar = (fran: string, till: string, ok: (d: Date) => boolean) => { const ut: string[] = []; for (const d = new Date(fran + "T00:00:00"); iso(d) <= till; d.setDate(d.getDate() + 1)) if (ok(d)) ut.push(iso(d)); return ut; };
const vardag = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
const rad = (medarbetare_id: string, datum: string, start = "06:00", slut = "15:00") => ({ medarbetare_id, datum, start_tid: start, slut_tid: slut });

const underlag = () => [
  // Oscar: ny förare, första pass 28 sep, mån–fre
  ...dagar("2026-09-28", "2026-10-13", vardag).map(d => rad("o", d)),
  // Joacim: vardagar 24 aug–25 sep, sedan åtta dagar i rad 29 sep–6 okt, sedan ledig
  ...dagar("2026-08-24", "2026-09-25", vardag).map(d => rad("j", d)),
  ...dagar("2026-09-29", "2026-10-06", () => true).map(d => rad("j", d)),
  // Natt: vardagar 24 aug–9 okt, men tis 6 okt är ett nattpass 22:00–06:00 och ons 7 okt är 14:00–17:00
  ...dagar("2026-08-24", "2026-10-09", vardag).filter(d => d !== "2026-10-06" && d !== "2026-10-07").map(d => rad("n", d)),
  rad("n", "2026-10-06", "22:00", "06:00"), rad("n", "2026-10-07", "14:00", "17:00"),
];

const lista = (nu?: Date | null) => beraknaVilobrottLista({ medarbetare: MED, arbetsdagar: underlag(), perioder: [], svar: [], trosklar: TROSKLAR, nu });
const nycklar = (l: ReturnType<typeof lista>) => l.map(b => `${b.namn}|${b.typ}|${b.datum}|${b.vila_h}`).sort();

describe("Vilobrott-listan med de gemensamma reglerna", () => {
  it("Oscar (ny förare) har inga veckovilabrott — förut ett falskt på 15 tim de första dagarna", () => {
    expect(nycklar(lista(NU)).filter(k => k.startsWith("Oscar"))).toEqual([]);
  });

  it("Joacim: åtta dagar i rad 29 sep–6 okt, ledig sedan dess — inget veckovilabrott (vilan efter 6 okt räknas); utan 'nu' (gamla regeln) fanns ett på 6 okt", () => {
    expect(nycklar(lista(NU)).filter(k => k.startsWith("Joacim"))).toEqual([]);
    expect(nycklar(lista(null)).filter(k => k.startsWith("Joacim"))).toEqual(["Joacim|veckovila|2026-10-06|15"]);
  });

  it("Natt: nattpasset tis 22:00–06:00 och ons 14:00 ger 8 tim dygnsvila — ett brott som förut dolts (32 tim)", () => {
    expect(nycklar(lista(NU)).filter(k => k.startsWith("Natt"))).toEqual(["Natt|dygnsvila|2026-10-06|8"]);
  });

  it("utan 'nu' används riktiga nu: samma som ett nu långt fram", () => {
    expect(nycklar(lista())).toEqual(nycklar(lista(new Date(2099, 0, 1))));
  });

  it("förarens svar läggs på brottet", () => {
    const l = beraknaVilobrottLista({
      medarbetare: MED, arbetsdagar: underlag(), perioder: [], trosklar: TROSKLAR, nu: NU,
      svar: [{ medarbetare_id: "n", datum: "2026-10-06", typ: "dygnsvila", besvarat_av_forare: true, orsak: "planerad_avtal", orsak_fritext: null }],
    });
    expect(l.find(b => b.namn === "Natt" && b.datum === "2026-10-06")?.svar).not.toBeNull();
  });
});

describe("Företagsledare får inga vilobrott (ATL gäller inte företagsledande ställning)", () => {
  // Samma pass för båda: en vecka i rad med 14 tim natter och en natt med 8,5 tim vila — ger både dygns- och veckovilobrott för den som omfattas.
  const pass = (id: string) => [
    ...dagar("2026-09-14", "2026-09-19", () => true).map(d => rad(id, d, "05:00", "15:00")),
    rad(id, "2026-09-20", "05:00", "20:30"), rad(id, "2026-09-21", "05:00", "15:30"),
  ];
  const kor = (foretagsledare: boolean) => beraknaVilobrottLista({
    medarbetare: [{ id: "a", namn: "Anna Berg" }, { id: "m", namn: "Martin Lindqvist", foretagsledare }],
    arbetsdagar: [...pass("a"), ...pass("m")], perioder: [], svar: [], trosklar: TROSKLAR, nu: null,
  });

  it("förutsättning: utan flaggan ger samma underlag brott för Martin", () => {
    expect(kor(false).filter(b => b.namn === "Martin Lindqvist").length).toBeGreaterThan(0);
  });
  it("med flaggan: inga vilobrott för Martin Lindqvist — men Anna med samma pass har dem kvar", () => {
    const l = kor(true);
    expect(l.filter(b => b.namn === "Martin Lindqvist")).toEqual([]);
    expect(l.filter(b => b.namn === "Anna Berg").length).toBeGreaterThan(0);
  });
  it("bara flaggan true undantar: null och false gör det inte (ett läsfel får aldrig dölja brott i tysthet)", () => {
    const med = (v: boolean | null | undefined) => beraknaVilobrottLista({
      medarbetare: [{ id: "m", namn: "Martin Lindqvist", foretagsledare: v }], arbetsdagar: pass("m"), perioder: [], svar: [], trosklar: TROSKLAR, nu: null,
    }).length;
    expect(med(null)).toBeGreaterThan(0);
    expect(med(undefined)).toBeGreaterThan(0);
    expect(med(false)).toBeGreaterThan(0);
  });
});


describe("admins 'hanterat' läggs på brottet, skilt från förarens svar", () => {
  const MED_ADMIN = [...MED, { id: "a", namn: "Martin Lindqvist" }];
  const med = (svar: any[]) => beraknaVilobrottLista({ medarbetare: MED_ADMIN, arbetsdagar: underlag(), perioder: [], svar, trosklar: TROSKLAR, nu: NU });
  const forsta = lista(NU)[0];

  it("kvitterat men obesvarat: hanterat finns, svaret är fortfarande null (admin svarar aldrig åt föraren)", () => {
    const b = med([{ medarbetare_id: forsta.medarbetare_id, datum: forsta.datum, typ: forsta.typ, besvarat_av_forare: false, orsak: null, orsak_fritext: null,
      kvitterad_tid: "2026-10-14T08:00:00Z", kvitterad_av_chef: "a", kvitterad_anteckning: " Kompledigt 3 h " }])
      .find(x => x.datum === forsta.datum && x.typ === forsta.typ)!;
    expect(b.svar).toBeNull();
    expect(b.hanterat).toEqual({ tid: "2026-10-14T08:00:00Z", av: "Martin Lindqvist", anteckning: "Kompledigt 3 h" });
  });

  it("utan kvittering är hanterat null; okänd person heter 'okänd'", () => {
    expect(lista(NU).every(b => b.hanterat === null)).toBe(true);
    const b = med([{ medarbetare_id: forsta.medarbetare_id, datum: forsta.datum, typ: forsta.typ, besvarat_av_forare: true, orsak: "annat", orsak_fritext: "storm",
      kvitterad_tid: "2026-10-14T08:00:00Z", kvitterad_av_chef: "borta", kvitterad_anteckning: null }])
      .find(x => x.datum === forsta.datum && x.typ === forsta.typ)!;
    expect(b.svar).not.toBeNull();
    expect(b.hanterat?.av).toBe("okänd");
  });
});
