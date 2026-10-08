import { describe, it, expect } from "vitest";
import { hempunktLage, arObekraftad, validerPunkt, bekraftaHempunkt, rensaEtikett, HITTADE_BARA_BYN } from "./hempunkt";

const NU = "2026-10-08T09:00:00.000Z";
const rad = (extra: Record<string, any> = {}) => ({
  id: "m1", hemadress: "Kompersmåla Gård 362 96", hem_lat: null, hem_lng: null, hem_koord_kalla: null, hem_bekraftad_tid: null,
  hem_geokod_status: null, hem_geokod_etikett: null, hem_geokod_precision: null, hem_geokod_lat: null, hem_geokod_lng: null, ...extra,
});

describe("hempunktLage: vad kartan ska visa", () => {
  it("ingen punkt och inget förslag → ingen karta", () => {
    expect(hempunktLage(rad()).typ).toBe("ingen");
  });
  it("förslaget är byns mittpunkt (ingen punkt än) → grovt förslag: kartan säger att bara byn hittades", () => {
    const l = hempunktLage(rad({ hem_geokod_status: "osaker", hem_geokod_lat: 56.38333, hem_geokod_lng: 14.78333, hem_geokod_precision: "locality", hem_geokod_etikett: "Kompersmåla, Almundsryd" }));
    expect(l).toMatchObject({ typ: "forslag", lat: 56.38333, lng: 14.78333, etikett: "Kompersmåla, Almundsryd", grov: true });
  });
  it("geokodad exakt punkt som ingen sett → punkt, obekräftad, inte grov", () => {
    const l = hempunktLage(rad({ hem_lat: 56.39, hem_lng: 14.77, hem_koord_kalla: "geokod", hem_geokod_status: "klar", hem_geokod_precision: "address", hem_geokod_etikett: "Kompersmåla Gård 1" }));
    expect(l).toMatchObject({ typ: "punkt", grov: false, bekraftad: false, kalla: "geokod" });
  });
  it("geokodad punkt som bekräftats → bekräftad", () => {
    expect(hempunktLage(rad({ hem_lat: 56.39, hem_lng: 14.77, hem_koord_kalla: "geokod", hem_geokod_precision: "address", hem_bekraftad_tid: NU }))).toMatchObject({ typ: "punkt", bekraftad: true });
  });
  it("en punkt satt för hand eller med GPS är redan en människas val → bekräftad utan stämpel", () => {
    expect(hempunktLage(rad({ hem_lat: 56.39, hem_lng: 14.77, hem_koord_kalla: "manuell" }))).toMatchObject({ bekraftad: true });
    expect(hempunktLage(rad({ hem_lat: 56.39, hem_lng: 14.77, hem_koord_kalla: "gps" }))).toMatchObject({ bekraftad: true });
  });
  it("en gammal 'använd ändå'-punkt (källa geokod, precision bara orten) är grov: den får aldrig se bekräftad ut", () => {
    const l = hempunktLage(rad({ hem_lat: 56.38333, hem_lng: 14.78333, hem_koord_kalla: "geokod", hem_geokod_precision: "locality", hem_bekraftad_tid: NU }));
    expect(l).toMatchObject({ typ: "punkt", grov: true, bekraftad: false });
  });
});

describe("arObekraftad: det som hamnar i Att åtgärda", () => {
  it("bara en geokodad punkt utan stämpel", () => {
    expect(arObekraftad(rad({ hem_lat: 1, hem_lng: 2, hem_koord_kalla: "geokod" }))).toBe(true);
    expect(arObekraftad(rad({ hem_lat: 1, hem_lng: 2, hem_koord_kalla: "geokod", hem_bekraftad_tid: NU }))).toBe(false);
    expect(arObekraftad(rad({ hem_lat: 1, hem_lng: 2, hem_koord_kalla: "manuell" }))).toBe(false);
    expect(arObekraftad(rad())).toBe(false);
  });
});

describe("validerPunkt: bara en punkt i Sverige sparas", () => {
  it.each([[56.39, 14.77, true], [0, 0, false], [NaN, 14, false], [56, Infinity, false], [40, 14, false], [56, 40, false]])("%s,%s → %s", (lat, lng, ok) => {
    expect(validerPunkt(lat as number, lng as number)).toBe(ok);
  });
});

describe("bekraftaHempunkt: skrivningen", () => {
  // Minimal fake med samma kedja som supabase-js: update(...).eq(...).select(...).maybeSingle()
  const fake = (start: any, stoppa = false) => {
    const tabell = [{ ...start }];
    const anrop: any[] = [];
    const sb = {
      from: (t: string) => {
        expect(t).toBe("medarbetare");
        let upd: any = null; let id: any = null;
        const kedja: any = {
          select: () => kedja,
          eq: (_c: string, v: any) => { id = v; return kedja; },
          update: (u: any) => { upd = u; anrop.push(u); return kedja; },
          maybeSingle: async () => ({
            data: upd ? (stoppa ? null : Object.assign(tabell.find(r => r.id === id)!, upd)) : tabell.find(r => r.id === id) || null,
            error: null,
          }),
        };
        return kedja;
      },
    };
    return { sb, tabell, anrop };
  };

  it("Stämmer: en exakt geokodad punkt stämplas, källan förblir geokod", async () => {
    const f = fake(rad({ hem_lat: 56.39, hem_lng: 14.77, hem_koord_kalla: "geokod", hem_geokod_precision: "address" }));
    const r = await bekraftaHempunkt(f.sb, "m1", { atgard: "stammer" }, NU);
    expect(r).toEqual({ ok: true });
    expect(f.tabell[0]).toMatchObject({ hem_bekraftad_tid: NU, hem_koord_kalla: "geokod", hem_lat: 56.39 });
  });
  it("Stämmer på byns mittpunkt nekas: falsk precision sparas inte", async () => {
    const f = fake(rad({ hem_lat: 56.38333, hem_lng: 14.78333, hem_koord_kalla: "geokod", hem_geokod_precision: "locality" }));
    const r = await bekraftaHempunkt(f.sb, "m1", { atgard: "stammer" }, NU);
    expect(r).toEqual({ ok: false, fel: HITTADE_BARA_BYN });
    expect(f.anrop).toEqual([]);
  });
  it("Stämmer utan punkt nekas", async () => {
    const f = fake(rad());
    expect((await bekraftaHempunkt(f.sb, "m1", { atgard: "stammer" }, NU)).ok).toBe(false);
    expect(f.anrop).toEqual([]);
  });
  it("Flytta: punkten blir manuell och bekräftad, status nollas, förslaget (vad adressen hamnade på) rörs inte", async () => {
    const f = fake(rad({ hem_geokod_status: "osaker", hem_geokod_lat: 56.38333, hem_geokod_lng: 14.78333, hem_geokod_precision: "locality", hem_geokod_etikett: "Kompersmåla, Almundsryd" }));
    const r = await bekraftaHempunkt(f.sb, "m1", { atgard: "flytta", lat: 56.3939, lng: 14.7729 }, NU);
    expect(r).toEqual({ ok: true });
    expect(f.anrop[0]).toEqual({ hem_lat: 56.3939, hem_lng: 14.7729, hem_koord_kalla: "manuell", hem_bekraftad_tid: NU, hem_geokod_status: null });
    expect(f.tabell[0]).toMatchObject({ hem_geokod_lat: 56.38333, hem_geokod_etikett: "Kompersmåla, Almundsryd" });
  });
  it("Flytta utanför Sverige eller med skräp nekas utan skrivning", async () => {
    const f = fake(rad());
    expect((await bekraftaHempunkt(f.sb, "m1", { atgard: "flytta", lat: 0, lng: 0 }, NU)).ok).toBe(false);
    expect((await bekraftaHempunkt(f.sb, "m1", { atgard: "flytta", lat: "x" as any, lng: 14 }, NU)).ok).toBe(false);
    expect(f.anrop).toEqual([]);
  });
  it("en skrivning som träffar 0 rader är ett fel, aldrig 'sparat'", async () => {
    const f = fake(rad({ hem_lat: 56.39, hem_lng: 14.77, hem_koord_kalla: "geokod", hem_geokod_precision: "address" }), true);
    const r = await bekraftaHempunkt(f.sb, "m1", { atgard: "stammer" }, NU);
    expect(r.ok).toBe(false);
  });
});

describe("rensaEtikett: geokodarens etikett utan landskod och engelska", () => {
  it.each([
    ["Kompersmåla, Almundsryd, KR, Sweden", "Kompersmåla, Almundsryd"],
    ["Björkvägen 4, Ryd, KR, Sweden", "Björkvägen 4, Ryd"],
    ["Storgatan 1, Växjö, G, Sweden", "Storgatan 1, Växjö"],
    ["Ryd, Sweden", "Ryd"],
    ["Ryd, Sverige", "Ryd"],
    ["Kompersmåla, Almundsryd", "Kompersmåla, Almundsryd"],
    ["Kompersmåla 3, Ryd, AB", "Kompersmåla 3, Ryd"],
    ["", ""],
  ])("%s → %s", (i, ut) => { expect(rensaEtikett(i)).toBe(ut); });
  it("null och undefined ger tom text", () => { expect(rensaEtikett(null)).toBe(""); expect(rensaEtikett(undefined)).toBe(""); });
  it("ett ortnamn som råkar vara kort behålls om det inte står sist före landet", () => {
    expect(rensaEtikett("Ed, Ryd, KR, Sweden")).toBe("Ed, Ryd");
    expect(rensaEtikett("Ryd, Ed")).toBe("Ryd, Ed");
  });
});

describe("hempunktLage: etiketten är geokodarens gissning och visas bara när punkten kommer från geokodningen", () => {
  it("en punkt satt för hand (förslaget från geokodningen ligger kvar i raden) har ingen geokodar-etikett", () => {
    const l = hempunktLage(rad({ hem_lat: 56.3939, hem_lng: 14.7729, hem_koord_kalla: "manuell", hem_geokod_etikett: "Kompersmåla, Almundsryd, KR, Sweden" }));
    expect(l).toMatchObject({ typ: "punkt", kalla: "manuell", etikett: "" });
  });
  it("GPS-punkt: ingen geokodar-etikett heller", () => {
    expect(hempunktLage(rad({ hem_lat: 1, hem_lng: 2, hem_koord_kalla: "gps", hem_geokod_etikett: "X, KR, Sweden" }))).toMatchObject({ etikett: "" });
  });
  it("geokodad punkt: etiketten visas, rensad", () => {
    expect(hempunktLage(rad({ hem_lat: 1, hem_lng: 2, hem_koord_kalla: "geokod", hem_geokod_precision: "address", hem_geokod_etikett: "Björkvägen 4, Ryd, KR, Sweden" }))).toMatchObject({ etikett: "Björkvägen 4, Ryd" });
  });
  it("förslaget (ingen punkt) visar den rensade etiketten", () => {
    expect(hempunktLage(rad({ hem_geokod_status: "osaker", hem_geokod_lat: 56.38, hem_geokod_lng: 14.78, hem_geokod_precision: "locality", hem_geokod_etikett: "Kompersmåla, Almundsryd, KR, Sweden" }))).toMatchObject({ typ: "forslag", etikett: "Kompersmåla, Almundsryd" });
  });
});
