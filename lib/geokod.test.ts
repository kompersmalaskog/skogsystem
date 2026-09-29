import { describe, it, expect } from "vitest";
import { tolkaGeokodSvar, byggGeokodUppdatering, accepteraForslag, punktSkyddad, precisionText } from "./geokod";

const NU = "2026-09-29T08:00:00.000Z";
const orsSvar = (layer: string, lat = 56.47, lng = 14.69, label = "Idekulla 6, Ryd") =>
  ({ features: [{ geometry: { coordinates: [lng, lat] }, properties: { label, layer } }] });

describe("tolkaGeokodSvar", () => {
  it("läser punkt, etikett och lager", () => {
    expect(tolkaGeokodSvar(orsSvar("address"))).toEqual({ ok: true, lat: 56.47, lng: 14.69, etikett: "Idekulla 6, Ryd", precision: "address" });
  });
  it("inga träffar = fel, aldrig en tom punkt", () => {
    expect(tolkaGeokodSvar({ features: [] })).toEqual({ ok: false, fel: "Adressen hittades inte" });
    expect(tolkaGeokodSvar(null)).toEqual({ ok: false, fel: "Adressen hittades inte" });
  });
});

describe("byggGeokodUppdatering — reglerna", () => {
  const tom = { hemadress: "Idekulla 6, 362 96 Ryd", hem_lat: null, hem_lng: null, hem_koord_kalla: null };
  it("exakt adress utan punkt → punkten sätts, källa geokod, status klar", () => {
    const u = byggGeokodUppdatering(tom, tolkaGeokodSvar(orsSvar("address")) as any, { nu: NU });
    expect(u).toMatchObject({ hem_lat: 56.47, hem_lng: 14.69, hem_koord_kalla: "geokod", hem_geokod_status: "klar", hem_geokod_precision: "address" });
  });
  it("bara orten (landsbygdsadress i tätortens mitt) → osäker, punkten rörs INTE, förslaget sparas", () => {
    const u = byggGeokodUppdatering(tom, tolkaGeokodSvar(orsSvar("locality", 56.46, 14.70, "Ryd")) as any, { nu: NU });
    expect(u.hem_geokod_status).toBe("osaker");
    expect(u).not.toHaveProperty("hem_lat");
    expect(u).toMatchObject({ hem_geokod_lat: 56.46, hem_geokod_etikett: "Ryd", hem_geokod_precision: "locality" });
  });
  it("GPS-punkt skyddas: ingen geokodning → hoppad", () => {
    const gps = { ...tom, hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "gps" };
    expect(punktSkyddad(gps)).toBe(true);
    expect(byggGeokodUppdatering(gps, null, { nu: NU })).toEqual({ hem_geokod_status: "hoppad", hem_geokod_tid: NU });
  });
  it("punkt utan källa räknas som skyddad (satt för hand)", () => {
    expect(punktSkyddad({ ...tom, hem_lat: 1, hem_lng: 2, hem_koord_kalla: null })).toBe(true);
    expect(punktSkyddad({ ...tom, hem_lat: 1, hem_lng: 2, hem_koord_kalla: "geokod" })).toBe(false);
  });
  it("tvinga + exakt skriver över en skyddad punkt; tvinga + grov gör det inte", () => {
    const man = { ...tom, hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "manuell" };
    expect(byggGeokodUppdatering(man, tolkaGeokodSvar(orsSvar("address")) as any, { tvinga: true, nu: NU })).toMatchObject({ hem_koord_kalla: "geokod", hem_geokod_status: "klar" });
    const grov = byggGeokodUppdatering(man, tolkaGeokodSvar(orsSvar("street")) as any, { tvinga: true, nu: NU });
    expect(grov.hem_geokod_status).toBe("osaker");
    expect(grov).not.toHaveProperty("hem_lat");
  });
  it("fel från leverantören → misslyckad med felet som etikett", () => {
    expect(byggGeokodUppdatering(tom, { ok: false, fel: "Kartleverantören svarade 503" }, { nu: NU })).toMatchObject({ hem_geokod_status: "misslyckad", hem_geokod_etikett: "Kartleverantören svarade 503" });
  });
});

describe("accepteraForslag + precisionText", () => {
  it("förslaget blir punkten när admin väljer 'använd ändå'", () => {
    expect(accepteraForslag({ hemadress: "x", hem_lat: null, hem_lng: null, hem_koord_kalla: null, hem_geokod_lat: 56.46, hem_geokod_lng: 14.7 }, NU))
      .toEqual({ hem_lat: 56.46, hem_lng: 14.7, hem_koord_kalla: "geokod", hem_geokod_status: "klar", hem_geokod_tid: NU });
    expect(accepteraForslag({ hemadress: "x", hem_lat: null, hem_lng: null, hem_koord_kalla: null }, NU)).toBeNull();
  });
  it("precisionen i ord", () => {
    expect(precisionText("address")).toBe("exakt adress");
    expect(precisionText("locality")).toBe("bara orten");
  });
});
