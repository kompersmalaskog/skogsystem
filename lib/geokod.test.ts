import { describe, it, expect } from "vitest";
import { tolkaGeokodSvar, byggGeokodUppdatering, punktSkyddad, precisionText } from "./geokod";

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

describe("precisionText", () => {
  it("precisionen i ord", () => {
    expect(precisionText("address")).toBe("exakt adress");
    expect(precisionText("locality")).toBe("bara orten");
  });
});

// ── Kompersmåla Gård 362 96: kartleverantören svarar med BYNS mittpunkt, märkt "venue" ──
// Verkligt svar (ORS /geocode/search, 2026-10-08): layer venue, source geonames (ortnamnsregistret, feature_code FRM),
// accuracy point. Det är en punkt för byn/gårdsnamnet, inte för huset: ca 1 km från gården, mitt i skogen. Förr sparades den
// som 'klar' med precision 'venue', alltså som om den vore exakt. En punkt ur ortnamnsregistret är aldrig adressnivå.
const kompersmala = {
  features: [{
    geometry: { coordinates: [14.78333, 56.38333] },
    properties: { label: "Kompersmåla, Almundsryd, KR, Sweden", layer: "venue", source: "geonames", accuracy: "point", match_type: "exact", confidence: 1, addendum: { geonames: { feature_code: "FRM" } } },
  }],
};
const osmHus = { features: [{ geometry: { coordinates: [14.7729, 56.3939] }, properties: { label: "Kompersmåla Gård 1, Ryd", layer: "address", source: "openstreetmap", accuracy: "point" } }] };

describe("Kompersmåla Gård 362 96: en adress som bara geokodar till byn", () => {
  const tom = { hemadress: "Kompersmåla Gård 362 96", hem_lat: null, hem_lng: null, hem_koord_kalla: null };

  it("ett venue ur ortnamnsregistret (geonames) får inte precisionen 'venue': det är bara orten", () => {
    const s = tolkaGeokodSvar(kompersmala) as any;
    expect(s.ok).toBe(true);
    expect(s.precision).toBe("locality");
    expect(s.etikett).toBe("Kompersmåla, Almundsryd, KR, Sweden");
  });
  it("byns mittpunkt sparas som osäker: ingen hempunkt, ingen status 'klar', förslaget finns för kartan", () => {
    const u = byggGeokodUppdatering(tom, tolkaGeokodSvar(kompersmala) as any, { nu: NU });
    expect(u.hem_geokod_status).toBe("osaker");
    expect(u).not.toHaveProperty("hem_lat");
    expect(u).not.toHaveProperty("hem_koord_kalla");
    expect(u).toMatchObject({ hem_geokod_lat: 56.38333, hem_geokod_lng: 14.78333, hem_geokod_precision: "locality", hem_geokod_etikett: "Kompersmåla, Almundsryd, KR, Sweden" });
  });
  it("en riktig adresspunkt (OpenStreetMap) räknas fortfarande som exakt, men är OBEKRÄFTAD tills admin sett den", () => {
    const s = tolkaGeokodSvar(osmHus) as any;
    expect(s.precision).toBe("address");
    const u = byggGeokodUppdatering(tom, s, { nu: NU });
    expect(u).toMatchObject({ hem_lat: 56.3939, hem_koord_kalla: "geokod", hem_geokod_status: "klar", hem_bekraftad_tid: null });
  });
  it("en ny geokodning av en tvingad punkt nollar bekräftelsen: den nya punkten har ingen sett", () => {
    const man = { ...tom, hem_lat: 56.4, hem_lng: 14.7, hem_koord_kalla: "manuell" };
    expect(byggGeokodUppdatering(man, tolkaGeokodSvar(osmHus) as any, { tvinga: true, nu: NU })).toMatchObject({ hem_bekraftad_tid: null });
  });
  it("ett svar utan källa räknas som förut (lagret avgör)", () => {
    expect((tolkaGeokodSvar(orsSvar("venue")) as any).precision).toBe("venue");
  });
});
