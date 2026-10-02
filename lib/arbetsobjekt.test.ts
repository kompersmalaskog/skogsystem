import { describe, it, expect } from "vitest";
import { byggArbetsObjektLista } from "./arbetsobjekt";

describe("byggArbetsObjektLista", () => {
  const dim = [
    { objekt_id: "11218909", object_name: "Betet gallring 2026", vo_nummer: "11218909", skogsagare: "Anna" },
    { objekt_id: "1234567890123", object_name: "1234567890123", skogsagare: "Bo", huvudtyp: "Gallring" },
  ];
  const objekt = [
    { vo_nummer: "11218909", status: "pagaende" },
    // Planerad trakt utan dim-rad — Trestensdal
    { vo_nummer: "11124748", status: "planerad", namn: "Trestensdal gallring 2025.", markagare: "Cia", lat: 56.49, lng: 15.1 },
    // Avslutad utan dim-rad — gammalt specialjobb, ska inte med
    { vo_nummer: "11122216", status: "avslutat", namn: "Äskebäck AU 2026" },
    // Utan VO — kan inte nycklas
    { vo_nummer: null, status: "planerad", namn: "Utan VO" },
    // Har FK mot en dim-rad som finns — ska inte dubbleras
    { vo_nummer: "99999", status: "planerad", namn: "FK-trakt", dim_objekt_id: "11218909" },
  ];
  const lista = byggArbetsObjektLista(dim, objekt);

  it("tar med planerade/pågående trakter utan dim-rad, med VO som id", () => {
    const t = lista.find(o => o.id === "11124748");
    expect(t?.namn).toMatch(/Trestensdal/);
    expect(t?.status).toBe("planerad");
    expect(t?.ägare).toBe("Cia");
  });
  it("lämnar avslutade utan dim-rad, objekt utan VO och FK-länkade dubbletter", () => {
    expect(lista.find(o => o.id === "11122216")).toBeUndefined();
    expect(lista.find(o => o.namn === "Utan VO")).toBeUndefined();
    expect(lista.find(o => o.id === "99999")).toBeUndefined();
  });
  it("status ur objekt via VO, och timestamp-namn faller tillbaka på ägare · typ", () => {
    expect(lista.find(o => o.id === "11218909")?.status).toBe("pagaende");
    expect(lista.find(o => o.id === "1234567890123")?.namn).toBe("Bo · Gallring");
  });
  it("sorterad på namn och tål tomma indata", () => {
    const namn = lista.map(o => o.namn);
    expect(namn).toEqual([...namn].sort((a, b) => a.localeCompare(b, "sv")));
    expect(byggArbetsObjektLista(null, undefined)).toEqual([]);
  });
});
