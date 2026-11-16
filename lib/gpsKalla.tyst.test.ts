import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// TYST PORT (Oskar, R64428, 2026-11-16): porten stod öppen men slutade leverera. read() väntar då för evigt, och förut öppnade ingenting om porten.
// Vakten stänger och öppnar den själv. Testerna kör vakten på millisekunder (GPS_TYST) — i appen är gränsen 30 s.

const rad = (kropp: string) => { let cs = 0; for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i); return "$" + kropp + "*" + cs.toString(16).toUpperCase().padStart(2, "0"); };
const nmeaNu = () => {
  const d = new Date(Date.now() - 2000);
  const p = (n: number) => String(n).padStart(2, "0");
  const t = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.00`;
  const dag = `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${p(d.getUTCFullYear() % 100)}`;
  return [rad(`GNGGA,${t},5621.387889,N,01502.992016,E,1,09,0.7,102.6,M,36.0,M,,`), rad(`GNRMC,${t},A,5621.387889,N,01502.992016,E,0.0,72.9,${dag},1.7,E,A,V`)].join("\r\n") + "\r\n";
};

/** En port som HÄNGER SIG: efter första meningen kommer inget mer och read() blir aldrig klar — tills läsningen avbryts. `lever` = varje ny öppning ger data igen. */
function hangdPort(o: { lever: boolean; skrap?: boolean }) {
  const st = { oppnade: 0, stangda: 0 };
  const port: any = {
    open: vi.fn(async () => { st.oppnade++; }),
    close: vi.fn(async () => { st.stangda++; }),
    readable: {
      getReader() {
        const forsta = st.oppnade === 1 || o.lever;
        let skickad = false; let vack: null | ((r: any) => void) = null;
        return {
          read: () => new Promise<any>((res) => {
            if (!skickad && forsta) { skickad = true; return res({ value: new TextEncoder().encode(o.skrap ? "skräp utan mening\r\n" : nmeaNu()), done: false }); }
            vack = res;   // hänger
          }),
          cancel: async () => { vack?.({ done: true }); },
          releaseLock() {},
        };
      },
    },
  };
  return { port, st };
}

const starta = async (o: { lever: boolean; skrap?: boolean }) => {
  const p = hangdPort(o);
  const m = new Map<string, string>([["gps-serial-vald", "1"]]);
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
  vi.stubGlobal("navigator", { serial: { getPorts: async () => [p.port], addEventListener() {}, removeEventListener() {} } });
  vi.resetModules();
  const g = await import("./gpsKalla");
  const logg = await import("./fart/fartLogg");
  logg.taAllt();
  g.GPS_TYST.ms = 120; g.GPS_TYST.maxMs = 480; g.GPS_TYST.kollMs = 20;
  const fixar: any[] = [];
  const h = g.startaGpsKalla((f) => fixar.push(f));
  return { p, h, fixar, g, logg };
};

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("tyst port öppnas om av sig själv", () => {
  it("porten hänger sig efter första fixen: den stängs och öppnas igen, och nya fixar kommer utan att någon rör något", async () => {
    const { p, h, fixar, logg } = await starta({ lever: true });
    await vi.waitFor(() => expect(fixar.some((f) => f.giltig)).toBe(true));
    const fore = fixar.length;
    await vi.waitFor(() => expect(p.st.oppnade).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    await vi.waitFor(() => expect(fixar.length).toBeGreaterThan(fore), { timeout: 4000 });
    expect(p.st.stangda).toBeGreaterThanOrEqual(1);
    const namn = logg.taAllt().map((r) => r.namn);
    expect(namn).toContain("gps:tyst-omstart");
    expect(namn).toContain("gps:tillbaka");
    h.stop();
  });

  it("skräp utan giltig mening räknas som tyst (porten lever men GPS:en säger inget)", async () => {
    const { p, h } = await starta({ lever: true, skrap: true });
    await vi.waitFor(() => expect(p.st.oppnade).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    h.stop();
  });

  it("GPS:en är död på riktigt: försöken glesas ut (30 s → 5 min i appen) i stället för att hamra på porten", async () => {
    const { p, h, logg } = await starta({ lever: false });
    await new Promise((r) => setTimeout(r, 2600));
    // gräns 120 → 240 → 480 → 480 ms, plus 1 s väntan före varje ny öppning: högst tre omstarter på 2,6 s. Utan utglesning hade det blivit fler loggrader per tid.
    expect(p.st.oppnade).toBeGreaterThanOrEqual(2);
    expect(p.st.oppnade).toBeLessThanOrEqual(3);
    expect(logg.taAllt().filter((r) => r.namn === "gps:tillbaka")).toHaveLength(0);
    h.stop();
  });

  it("data som kommer hela tiden: porten rörs aldrig", async () => {
    // En port som svarar på varje read() med en ny mening var 30:e ms.
    const st = { oppnade: 0 };
    const port: any = {
      open: async () => { st.oppnade++; }, close: async () => {},
      readable: { getReader() { let slut = false; return { read: () => new Promise<any>((res) => setTimeout(() => res(slut ? { done: true } : { value: new TextEncoder().encode(nmeaNu()), done: false }), 30)), cancel: async () => { slut = true; }, releaseLock() {} }; } },
    };
    const m = new Map<string, string>([["gps-serial-vald", "1"]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
    vi.stubGlobal("navigator", { serial: { getPorts: async () => [port], addEventListener() {}, removeEventListener() {} } });
    vi.resetModules();
    const g = await import("./gpsKalla");
    g.GPS_TYST.ms = 120; g.GPS_TYST.kollMs = 20;
    const h = g.startaGpsKalla(() => {});
    await new Promise((r) => setTimeout(r, 700));
    expect(st.oppnade).toBe(1);
    h.stop();
  });
});
