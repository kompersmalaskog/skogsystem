/**
 * Admin → Förare · Månad: från → till på ALLA dagar, och vad appen hade fått där km är förarens egen. Daniel Johansson september 2026 (ur prod):
 * 1 sep har BERÄKNAD km (113 km), 15 sep förarens EGNA 160 km mot trakten Akelius. Appens värde är bara visning: dagens km och lönen rörs aldrig.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { tabellKlient } from "@/lib/lonesystem/testdata/tabellKlient";
import { danielUnderlag, danielTabeller, APPENS_MORGON_KM, APPENS_KVALL_KM } from "@/lib/lonesystem/testdata/danielSep";
import { byggForarManad } from "@/lib/admin/forarManadVy";
import { getRödaDagar } from "@/lib/roda-dagar";

beforeAll(() => { delete process.env.ORS_API_KEY; });   // routing går bara mot route_cache i testet, aldrig ut mot ORS

async function daniel(val?: Parameters<typeof danielUnderlag>[0]) {
  const { m } = await danielUnderlag(val);
  const vy = byggForarManad(m, { rodaDagar: getRödaDagar(2026), maskinNamn: { A130743: "Wisent" } });
  return { m, vy };
}
const dag = (vy: any, datum: string) => vy.dagar.find((d: any) => d.datum === datum);
const milRad = (vy: any, datum: string) => vy.km.dagarOver.find((d: any) => d.datum === datum)?.text as string | undefined;

describe("Förare · Månad — Daniel september 2026, km med källa och rutt", () => {
  it("15 sep: egen 160 km + vad appen hade fått (118 km), trakten Akelius, och 10 mil", async () => {
    const { m, vy } = await daniel();
    const d = m.dagar.find((x: any) => x.datum === "2026-09-15");
    expect(d.km_kalla).toBe("forare");
    expect(d.km_totalt).toBe(160);
    expect(d.km_rutt).toEqual({ forsta: "400763 Akelius Tåget SA -26", sista: "400763 Akelius Tåget SA -26", appen: { morgon: APPENS_MORGON_KM, kvall: APPENS_KVALL_KM, totalt: 118 } });
    const v = dag(vy, "2026-09-15");
    expect(v.rad).toBe("06:00–16:00 · rast 30 min · Hem → 400763 Akelius Tåget SA -26 · 160 km egen (appen: 118 km) · → 10 mil");
    expect(v.detalj).toContain("Hem → 400763 Akelius Tåget SA -26 · 80 km (appen: 58 km)");
    expect(v.detalj).toContain("400763 Akelius Tåget SA -26 → Hem · 80 km (appen: 60 km)");
    expect(v.detalj).toContain("Egen · 160 km totalt (appen: 118 km) · 10 mil ersätts");
    expect(milRad(vy, "2026-09-15")).toBe("15 sep · Hem → 400763 Akelius Tåget SA -26 · 160 km egen (appen: 118 km) · → 10 mil");
  });

  it("dagraden delas i två rader: tider, och plats/km — så den inte pressas ihop bredvid tiden", async () => {
    const { vy } = await daniel();
    const v = dag(vy, "2026-09-15");
    expect(v.radTid).toEqual(["06:00–16:00", "rast 30 min"]);
    expect(v.radKm).toEqual(["Hem → 400763 Akelius Tåget SA -26", "160 km egen (appen: 118 km)", "→ 10 mil"]);
    expect(v.radDelar).toEqual([...v.radTid, ...v.radKm]);
  });

  it("1 sep: beräknad 113 km, ingen jämförelse — appen är redan det som står", async () => {
    const { m, vy } = await daniel();
    const d = m.dagar.find((x: any) => x.datum === "2026-09-01");
    expect(d.km_kalla).toBe("auto");
    expect(d.km_rutt.appen).toBeNull();
    expect(d.km_rutt.forsta).toBe("Stänkelsmåla 2025");     // Flyttobjektet (VIDA FLYTT) har ingen plats och hoppas över
    const v = dag(vy, "2026-09-01");
    expect(v.rad).toContain("Hem → Stänkelsmåla 2025 · 113 km beräknad");
    expect(v.rad).not.toContain("appen");
    expect(v.detalj).toContain("Hem → Stänkelsmåla 2025 · 57 km");
    expect(v.detalj).toContain("Stänkelsmåla 2025 → Hem · 56 km");
    expect(v.detalj).toContain("Beräknad · 113 km totalt · 6 mil ersätts");
    // 113 km ligger över 60 km/dag: dagen står i mil-listan, utan appens värde
    expect(milRad(vy, "2026-09-01")).toBe("1 sep · Hem → Stänkelsmåla 2025 · 113 km beräknad · → 6 mil");
  });

  it("routing går inte att räkna (sträckan saknas i cachen): bara trakten, ingen appen-siffra", async () => {
    const { m, vy } = await daniel({ cacheFor: [] });
    const d = m.dagar.find((x: any) => x.datum === "2026-09-15");
    expect(d.km_rutt).toEqual({ forsta: "400763 Akelius Tåget SA -26", sista: "400763 Akelius Tåget SA -26", appen: null });
    expect(dag(vy, "2026-09-15").rad).toContain("Hem → 400763 Akelius Tåget SA -26 · 160 km egen · → 10 mil");
    expect(dag(vy, "2026-09-15").rad).not.toContain("appen");
  });

  it("hemadressen saknar koordinat: bara trakten", async () => {
    const { m } = await daniel({ hem: false });
    const d = m.dagar.find((x: any) => x.datum === "2026-09-15");
    expect(d.km_rutt.appen).toBeNull();
    expect(d.km_rutt.forsta).toBe("400763 Akelius Tåget SA -26");
  });

  it("trakten saknar koordinat: ändå första och sista trakten, ingen appen-siffra", async () => {
    const { m, vy } = await daniel({ koordinater: false });
    const d = m.dagar.find((x: any) => x.datum === "2026-09-15");
    expect(d.km_rutt).toEqual({ forsta: "400763 Akelius Tåget SA -26", sista: "400763 Akelius Tåget SA -26", appen: null });
    expect(dag(vy, "2026-09-15").detalj).toContain("Hem → 400763 Akelius Tåget SA -26 · 80 km");
  });

  it("en dag där trakten saknar koordinat men ordningen är känd visar första och sista (22 sep: Kyrkhult GROT)", async () => {
    const { m } = await daniel();
    const d = m.dagar.find((x: any) => x.datum === "2026-09-22");
    expect(d.km_kalla).toBe("forare");
    expect(d.km_rutt).toEqual({ forsta: "Kyrkhult GROT ATA", sista: "Kyrkhult GROT ATA", appen: null });
  });

  it("flera trakter: första och sista trakten, ben för ben (14 sep)", async () => {
    const { vy } = await daniel();
    const v = dag(vy, "2026-09-14");
    expect(v.detalj.some((t: string) => t.startsWith("Hem → 400763 Akelius Tåget SA -26 · 67 km"))).toBe(true);
    expect(v.detalj.some((t: string) => t.startsWith("Rävemåla AU 2026 → Hem · 77 km"))).toBe(true);
  });

  it("LÖNEN OFÖRÄNDRAD: appens värde är bara visning — dagens km, mil och alla lönerader är desamma med och utan", async () => {
    const med = await danielUnderlag({ cacheFor: ["11208196"] }, true);
    const utanRoutning = await danielUnderlag({ cacheFor: [], hem: false }, true);
    const utanGranskning = await danielUnderlag({ cacheFor: ["11208196"] }, false);
    for (const annan of [utanRoutning, utanGranskning]) {
      expect(JSON.stringify(annan.u.resultat)).toBe(JSON.stringify(med.u.resultat));
      expect(annan.m.kor_mil).toBe(med.m.kor_mil);
      expect(annan.m.dagar.map((d: any) => [d.datum, d.km_totalt, d.ersattningsmil, d.km_kalla])).toEqual(med.m.dagar.map((d: any) => [d.datum, d.km_totalt, d.ersattningsmil, d.km_kalla]));
    }
    // 15 sep skrevs som egen 160 km och räknas som 160, inte som appens 118
    expect(med.m.dagar.find((d: any) => d.datum === "2026-09-15").ersattningsmil).toBe(10);
    // utan granskningsstöd finns inga rutter alls (exporten läser inga koordinater)
    expect(utanGranskning.m.dagar.every((d: any) => d.km_rutt === null)).toBe(true);
  });

  it("en beräknad dag får aldrig en appen-siffra, ens när sträckan finns i cachen — appens värde är bara jämförelsen mot förarens egna km", async () => {
    const { m } = await daniel({ cacheFor: ["11131022", "11208196"] });
    expect(m.dagar.find((x: any) => x.datum === "2026-09-01").km_rutt.appen).toBeNull();
    expect(m.dagar.find((x: any) => x.datum === "2026-09-02").km_rutt.appen).not.toBeNull();   // 2 sep är förarens egna
  });

  it("vymodellen visar aldrig 'appen' på en beräknad dag, även om datat skulle bära en siffra", async () => {
    const { m } = await danielUnderlag();
    const kopia = JSON.parse(JSON.stringify(m));
    kopia.dagar.find((d: any) => d.datum === "2026-09-01").km_rutt.appen = { morgon: 1, kvall: 1, totalt: 2 };
    const vy = byggForarManad(kopia, { rodaDagar: getRödaDagar(2026), maskinNamn: {} });
    expect(dag(vy, "2026-09-01").rad).not.toContain("appen");
    expect(dag(vy, "2026-09-01").detalj.join(" ")).not.toContain("appen");
  });
});

describe("Förare · Månad — routing mot ORS första gången", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ORS_API_KEY; });

  it("ORS räknar sträckan och svaret cachas; högst 20 anrop per körning, resten visas utan appens värde tills de är cachade", async () => {
    process.env.ORS_API_KEY = "test";
    const anrop: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { anrop.push(String(url)); return { ok: true, status: 200, json: async () => ({ features: [{ properties: { summary: { distance: 59000 } } }] }), text: async () => "" }; }));
    // En klient där route_cache aldrig sparar något: varje dag måste fråga ORS igen, så taket syns.
    const t: any = danielTabeller({ cacheFor: [] });
    const bas: any = tabellKlient(t);
    const klient = { from: (n: string) => { const q: any = bas.from(n); if (n === "route_cache") q.upsert = async () => ({ error: null }); return q; } };
    const { m } = await danielUnderlag(undefined, true, klient);
    const medAppen = m.dagar.filter((d: any) => d.km_rutt?.appen);
    expect(anrop).toHaveLength(20);                  // taket: 20 ORS-anrop, två per dag
    expect(medAppen).toHaveLength(10);
    expect(medAppen[0].km_rutt.appen).toEqual({ morgon: 59, kvall: 59, totalt: 118 });
    // och dagens km är orörda
    expect(m.dagar.find((d: any) => d.datum === "2026-09-15").km_totalt).toBe(160);
  });

  it("utan ORS-nyckel frågas aldrig ORS: bara cachen", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    await daniel({ cacheFor: [] });
    expect(f).not.toHaveBeenCalled();
  });
});
