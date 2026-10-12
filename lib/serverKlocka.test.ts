import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  beraknaOffset, synkaKlocka, startaKlockSynk, serverNu, klockaKorr, aterstallKlocka,
  KLOCKA_SYNK_MS, KLOCKA_MAX_RTT_MS, KLOCKA_URL,
} from "./serverKlocka";

const utc = (y: number, mo: number, d: number, h: number, mi: number, s = 0, ms = 0) => Date.UTC(y, mo - 1, d, h, mi, s, ms);
const SANN = utc(2026, 10, 8, 12, 0, 0);
const HUVUD = "Thu, 08 Oct 2026 12:00:00 GMT";
const svar = (date: string | null) => ({ headers: { get: (n: string) => (n.toLowerCase() === "date" ? date : null) } });

beforeEach(() => { aterstallKlocka(); });
afterEach(() => { vi.useRealTimers(); });

describe("beraknaOffset: datorns avvikelse ur Date-huvudet", () => {
  it("datorn 4 min före → offset ≈ −240 s", () => {
    const dator = SANN + 240_000;
    const off = beraknaOffset(HUVUD, dator - 100, dator + 100) as number;
    expect(Math.abs(off + 240_000)).toBeLessThan(1000);
  });
  it("datorn 90 s efter → positivt offset", () => {
    const dator = SANN - 90_000;
    expect(Math.abs((beraknaOffset(HUVUD, dator - 100, dator + 100) as number) - 90_000)).toBeLessThan(1000);
  });
  it("klockan stämmer → offset inom en sekund av noll", () => {
    expect(Math.abs(beraknaOffset(HUVUD, SANN - 100, SANN + 100) as number)).toBeLessThan(1000);
  });
  it("svarstiden kompenseras: samma server-tid ger samma offset oavsett var i anropet servern stämplade (mittpunkten)", () => {
    const dator = SANN + 240_000;
    const kort = beraknaOffset(HUVUD, dator - 50, dator + 50) as number;
    const lang = beraknaOffset(HUVUD, dator - 1500, dator + 1500) as number;
    expect(Math.abs(kort - lang)).toBeLessThan(10);
  });
  it("saknat/ogiltigt Date-huvud → null (behåll förra värdet)", () => {
    expect(beraknaOffset(null, 0, 100)).toBeNull();
    expect(beraknaOffset("", 0, 100)).toBeNull();
    expect(beraknaOffset("inte ett datum", 0, 100)).toBeNull();
  });
  it("för lång svarstid → null (mittpunkten för osäker); negativ svarstid → null", () => {
    expect(beraknaOffset(HUVUD, SANN, SANN + KLOCKA_MAX_RTT_MS + 1)).toBeNull();
    expect(beraknaOffset(HUVUD, SANN, SANN + KLOCKA_MAX_RTT_MS)).not.toBeNull();
    expect(beraknaOffset(HUVUD, SANN + 10, SANN)).toBeNull();
  });
  it("orimlig avvikelse (> 30 dygn) → null: ett trasigt svar, inte en klocka som går fel", () => {
    expect(beraknaOffset(HUVUD, SANN + 40 * 86400_000, SANN + 40 * 86400_000 + 100)).toBeNull();
  });
});

describe("synkaKlocka: ett synkförsök", () => {
  it("lyckat försök: serverNu() ger verklig tid (datorn 4 min före) och klar=true", async () => {
    vi.useFakeTimers(); vi.setSystemTime(SANN + 240_000);
    expect(klockaKorr().klar).toBe(false);
    const hamta = vi.fn(async () => svar(HUVUD));
    expect(await synkaKlocka(hamta)).toBe(true);
    expect(hamta).toHaveBeenCalledTimes(1);
    const url = (hamta.mock.calls[0] as unknown[])[0] as string;
    expect(url.startsWith(KLOCKA_URL + "?")).toBe(true);   // cache-bust, mot den öppna force-dynamic-rutten
    expect(klockaKorr().klar).toBe(true);
    expect(Math.abs(serverNu() - SANN)).toBeLessThan(1000);
    // hyttspårspunktens tid-sträng blir den verkliga tiden, inte datorns
    expect(new Date(serverNu()).toISOString().slice(0, 16)).toBe("2026-10-08T12:00");
    expect(new Date(Date.now()).toISOString().slice(0, 16)).toBe("2026-10-08T12:04");
  });

  it("misslyckat försök (offline) behåller förra värdet; första misslyckade försöket ger klar=true med offset 0", async () => {
    vi.useFakeTimers(); vi.setSystemTime(SANN + 240_000);
    expect(await synkaKlocka(async () => { throw new Error("offline"); })).toBe(false);
    expect(klockaKorr()).toEqual({ offsetMs: 0, klar: true });
    expect(await synkaKlocka(async () => svar(HUVUD))).toBe(true);
    const efterLyckat = klockaKorr().offsetMs;
    expect(await synkaKlocka(async () => { throw new Error("offline"); })).toBe(false);
    expect(klockaKorr().offsetMs).toBe(efterLyckat);
    expect(await synkaKlocka(async () => svar(null))).toBe(false);   // svar utan Date-huvud ändrar inget
    expect(klockaKorr().offsetMs).toBe(efterLyckat);
  });
});

describe("startaKlockSynk: vid start och var 10:e minut", () => {
  it("ett försök direkt, sedan var 10:e minut, och inget efter stopp", async () => {
    vi.useFakeTimers(); vi.setSystemTime(SANN + 240_000);
    const hamta = vi.fn(async () => svar(HUVUD));
    const stopp = startaKlockSynk(hamta);
    await vi.advanceTimersByTimeAsync(0);
    expect(hamta).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(KLOCKA_SYNK_MS - 1);
    expect(hamta).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(hamta).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(KLOCKA_SYNK_MS);
    expect(hamta).toHaveBeenCalledTimes(3);
    stopp();
    await vi.advanceTimersByTimeAsync(KLOCKA_SYNK_MS * 3);
    expect(hamta).toHaveBeenCalledTimes(3);
  });

  it("flera prenumeranter delar EN timer; den stannar först när sista slutar; dubbel-stopp räknas en gång", async () => {
    vi.useFakeTimers(); vi.setSystemTime(SANN);
    const hamta = vi.fn(async () => svar(HUVUD));
    const a = startaKlockSynk(hamta), b = startaKlockSynk(hamta);
    await vi.advanceTimersByTimeAsync(0);
    expect(hamta).toHaveBeenCalledTimes(1);
    a(); a();
    await vi.advanceTimersByTimeAsync(KLOCKA_SYNK_MS);
    expect(hamta).toHaveBeenCalledTimes(2);   // b lever kvar
    b();
    await vi.advanceTimersByTimeAsync(KLOCKA_SYNK_MS * 2);
    expect(hamta).toHaveBeenCalledTimes(2);
  });
});

describe("kopplingen: hyttspårets tid, drivern och rutten", () => {
  const las = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  const page = las("../app/planering/page.tsx");
  const kalla = las("./gpsKalla.ts");

  it("hyttspårspunktens tid kommer ur serverNu() — inte Date.now() (alla led går via cand.ts)", () => {
    expect(page).toContain("const cand = { lat: pos.lat, lon: pos.lon, ts: serverNu(), accuracy: gpsAccuracy ?? 999 };");
    expect(page).not.toMatch(/const cand = \{[^}]*ts: Date\.now\(\)/);
    expect(page.split("hyttsparTillLinjer").length).toBeGreaterThan(1);   // sanity: vi läser rätt fil
  });
  it("hyttspårets radets datum (skapa/återuppta + dagens-filtret) räknas på verklig tid", () => {
    expect(page).toContain("const datum = lokaltDatumStockholm(serverNu());");
    expect(page).toContain("idag = lokaltDatumStockholm(serverNu());");
  });
  it("drivern ger nmeaStateTillFix och matNmeaRad den uppmätta klockkorrigeringen, i serial-loopen och i portprovningen", () => {
    expect(kalla).toContain("state = matNmeaRad(state, rad, nuMs, kk);");
    expect(kalla).toContain("const fix = nmeaStateTillFix(state, nuMs, FIX_MAX_ALDER_MS, FORDROJD_MAX_MS, kk);");
    expect(kalla).toContain("const kk = klockaKorr();");
    expect((kalla.match(/klockaKorr\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it("klocksynken startar med hubbens första prenumerant och stoppar med den sista (inte i fast läge)", () => {
    expect(kalla).toContain("if (!fastLage && !stoppaKlockSynk) stoppaKlockSynk = startaKlockSynk();");
    expect(kalla).toContain("if (stoppaKlockSynk) { stoppaKlockSynk(); stoppaKlockSynk = null; }");
  });
  it("rutten klocksynken anropar är öppen utan session (annars får en utloggad maskindator aldrig någon korrigering)", () => {
    expect(las("../middleware.ts")).toContain("'/api/version'");
    const rutt = las("../app/api/version/route.ts");
    expect(rutt).toContain("force-dynamic");
    expect(rutt).toContain("no-store");   // Date-huvudet måste vara färskt, aldrig från en cache
    expect(KLOCKA_URL).toBe("/api/version");
  });
  it("klockavvikelsen visas aldrig för föraren: ingen sträng om klockan i planeringsvyn", () => {
    expect(page).not.toMatch(/klockavvikelse|klockan går|Klockan går|datorns klocka (går|visar)/i);
  });
});
