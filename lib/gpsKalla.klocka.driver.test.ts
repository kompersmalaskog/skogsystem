import { describe, it, expect, vi, afterEach } from "vitest";

// KLOCKAVVIKELSEN genom hela drivern (serial → hub → klocksynk → abonnent). Fältfel Giant 2026-10-08: datorns klocka gick ca 4 min FÖRE, så
// färsk GPS såg 4 min gammal ut och blev "fördröjd". Här kör vi riktiga drivern mot en fejkad serieport som skickar NMEA löpande, med
// datorns klocka 4 min före och en mockad /api/version vars Date-huvud är VERKLIG tid. (Satelliternas UTC-tid är alltid rätt.)

const rad = (kropp: string) => {
  let cs = 0;
  for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i);
  return "$" + kropp + "*" + cs.toString(16).toUpperCase().padStart(2, "0");
};
const nmeaVid = (tidMs: number) => {
  const d = new Date(tidMs);
  const p = (n: number) => String(n).padStart(2, "0");
  const hhmmss = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.00`;
  const ddmmyy = `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${p(d.getUTCFullYear() % 100)}`;
  return [
    rad(`GNGGA,${hhmmss},5621.387889,N,01502.992016,E,1,09,0.7,102.6,M,36.0,M,,`),
    rad(`GNRMC,${hhmmss},A,5621.387889,N,01502.992016,E,0.0,72.9,${ddmmyy},1.7,E,A,V`),
  ].join("\r\n") + "\r\n";
};

const ORIGINAL_NU = Date.now.bind(Date);
const sannNu = () => ORIGINAL_NU();                        // VERKLIG tid
const FORE_MS = 4 * 60_000;                                // datorn går 4 min före
const datorNu = () => ORIGINAL_NU() + FORE_MS;

/** Serieport som skickar `leverans()` var 40:e ms (som en GPS som skickar löpande). */
function lopandePort(leverans: () => string) {
  const ko: string[] = [];
  let vantar: ((r: { value?: Uint8Array; done: boolean }) => void) | null = null;
  let avbruten = false;
  const enc = (t: string) => new TextEncoder().encode(t);
  const timer = setInterval(() => {
    const t = leverans();
    if (vantar) { const v = vantar; vantar = null; v({ value: enc(t), done: false }); } else ko.push(t);
  }, 40);
  const port = {
    open: vi.fn(async () => { /* */ }),
    close: vi.fn(async () => { clearInterval(timer); }),
    readable: {
      getReader() {
        return {
          read: () => new Promise<{ value?: Uint8Array; done: boolean }>((res) => {
            if (avbruten) return res({ done: true });
            if (ko.length) return res({ value: enc(ko.shift()!), done: false });
            vantar = res;
          }),
          cancel: async () => { avbruten = true; if (vantar) vantar({ done: true }); },
          releaseLock() { /* */ },
        };
      },
    },
  };
  return { port, stoppa: () => clearInterval(timer) };
}

function lagring(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
}

/** Datorn 4 min före + serieport + /api/version. `fetchSvar`: null = offline, annars fördröjning i ms innan servern svarar. */
async function starta(leverans: () => string, fetchSvar: number | null) {
  vi.spyOn(Date, "now").mockImplementation(datorNu);
  const lp = lopandePort(leverans);
  const fetchMock = vi.fn(async (_url: string) => {
    if (fetchSvar == null) throw new TypeError("Failed to fetch");
    await new Promise((r) => setTimeout(r, fetchSvar));
    return { headers: { get: (n: string) => (n.toLowerCase() === "date" ? new Date(sannNu()).toUTCString() : null) } };
  });
  vi.stubGlobal("window", {});
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", lagring({ "gps-serial-vald": "1" }));
  vi.stubGlobal("navigator", { serial: { getPorts: async () => [lp.port] } });
  vi.resetModules();
  const g = await import("./gpsKalla");
  const fixar: any[] = [];
  const h = g.startaGpsKalla((f) => fixar.push(f));
  return { g, h, fixar, lp, fetchMock };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("klockavvikelse genom drivern: datorn 4 min före", () => {
  it("KODBEVIS: färsk NMEA → giltig (aldrig fördröjd). Före första klocksynken avgörs inget (giltig=false, fordrojd=false), därefter giltig", async () => {
    const { h, fixar, lp, fetchMock } = await starta(() => nmeaVid(sannNu() - 2000), 150);   // servern svarar efter 150 ms
    await vi.waitFor(() => expect(fixar.some((f) => f.giltig)).toBe(true), { timeout: 4000 });
    expect(fixar.every((f) => !f.fordrojd)).toBe(true);                // aldrig en falsk "GPS-data är fördröjd"
    expect(fixar[0].giltig).toBe(false);                               // före synken: avvaktar
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0]).startsWith("/api/version")).toBe(true);
    expect(Math.abs(fixar[fixar.length - 1].nmeaAlderMs - 2500)).toBeLessThan(1500);   // verklig ålder ≈ 2 s (+ Date-huvudets halva sekund), inte 4 min
    h.stop(); lp.stoppa();
  });

  it("KODBEVIS: NMEA 2 h gammal → fördröjd med VERKLIG ålder (2 h, inte 2 h 4 min); ingen giltig fix hamnar hos abonnenten", async () => {
    const { g, h, fixar, lp } = await starta(() => nmeaVid(sannNu() - 2 * 3600_000), 50);
    await vi.waitFor(() => expect(fixar.some((f) => f.fordrojd)).toBe(true), { timeout: 4000 });
    expect(fixar.every((f) => !f.giltig)).toBe(true);
    const sista = fixar.filter((f) => f.fordrojd).pop();
    expect(Math.abs(sista.nmeaAlderMs - 2 * 3600_000)).toBeLessThan(2000);
    expect(g.senasteGiltigaGpsFix()).toBeNull();
    h.stop(); lp.stoppa();
  });

  it("offline (ingen klocksynk går att göra): beteendet är som #700 — datorns klocka gäller, färsk NMEA ser fördröjd ut (gränsen för vad som går att rädda)", async () => {
    const { h, fixar, lp } = await starta(() => nmeaVid(sannNu() - 2000), null);
    await vi.waitFor(() => expect(fixar.some((f) => f.fordrojd)).toBe(true), { timeout: 4000 });
    h.stop(); lp.stoppa();
  });

  it("klocksynken följer hubben: ingen prenumerant → ingen synk; stopp av sista prenumeranten stoppar timern (inga fler anrop)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { h, lp, fetchMock } = await starta(() => nmeaVid(sannNu() - 2000), 0);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);                       // kontroll: timern går medan någon prenumererar (var 10:e minut)
    h.stop(); lp.stoppa();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);                       // sista prenumeranten borta → timern är stoppad
    vi.useRealTimers();
  });
});
