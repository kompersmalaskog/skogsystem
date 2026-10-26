import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ÅTERANSLUTNING UTAN TIMER: när Web Serial annonserar att porten är tillbaka (connect) återansluts direkt. Reservtimern (10 s) är bara reserv.
// Testerna kör med riktiga timers och kräver < 2 s — går det på 10 s-timern faller de.

const rad = (kropp: string) => { let cs = 0; for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i); return "$" + kropp + "*" + cs.toString(16).toUpperCase().padStart(2, "0"); };
const nmeaNu = () => {
  const d = new Date(Date.now() - 2000);
  const p = (n: number) => String(n).padStart(2, "0");
  const t = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.00`;
  const dag = `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${p(d.getUTCFullYear() % 100)}`;
  return [rad(`GNGGA,${t},5621.387889,N,01502.992016,E,1,09,0.7,102.6,M,36.0,M,,`), rad(`GNRMC,${t},A,5621.387889,N,01502.992016,E,0.0,72.9,${dag},1.7,E,A,V`)].join("\r\n") + "\r\n";
};

/** En port som kan "dras ur": read() ger done/kast, open() misslyckas tills den är åter. */
function fakePort() {
  const st = { ansluten: true, oppnade: 0, kvarLasare: null as null | ((r: any) => void) };
  const port: any = {
    open: vi.fn(async () => { if (!st.ansluten) throw new Error("borta"); st.oppnade++; }),
    close: vi.fn(async () => {}),
    readable: {
      getReader() {
        let skickad = false, avbruten = false;
        return {
          read: () => new Promise<any>((res, rej) => {
            if (avbruten || !st.ansluten) return rej(new Error("porten borta"));
            if (!skickad) { skickad = true; return res({ value: new TextEncoder().encode(nmeaNu()), done: false }); }
            st.kvarLasare = (r) => (r === "tappa" ? rej(new Error("porten borta")) : res(r));
          }),
          cancel: async () => { avbruten = true; st.kvarLasare?.({ done: true }); },
          releaseLock() {},
        };
      },
    },
  };
  return { port, st, dra: () => { st.ansluten = false; st.kvarLasare?.("tappa"); } };
}

function fakeSerial(portar: any[]) {
  const lyssnare = new Set<() => void>();
  return {
    getPorts: async () => portar,
    addEventListener: (t: string, f: () => void) => { if (t === "connect") lyssnare.add(f); },
    removeEventListener: (t: string, f: () => void) => { if (t === "connect") lyssnare.delete(f); },
    connect: () => lyssnare.forEach((f) => f()),
    antal: () => lyssnare.size,
  };
}

const importera = async () => { vi.resetModules(); return await import("./gpsKalla"); };
beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.unstubAllGlobals(); });

const starta = async () => {
  const p = fakePort();
  const serial = fakeSerial([p.port]);
  const m = new Map<string, string>([["gps-serial-vald", "1"]]);
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
  vi.stubGlobal("navigator", { serial });
  const g = await importera();
  const fixar: any[] = [];
  const h = g.startaGpsKalla((f) => fixar.push(f));
  await vi.waitFor(() => expect(fixar.some((f) => f.giltig)).toBe(true));
  return { p, serial, h, fixar };
};

describe("återanslutning via connect-händelsen", () => {
  it("porten tappas och kommer tillbaka: ny öppning och nya fixar på < 2 s (reservtimern är 10 s)", async () => {
    const { p, serial, h, fixar } = await starta();
    p.dra();
    await vi.waitFor(() => expect(p.port.close).toHaveBeenCalled());
    const fore = fixar.length;
    p.st.ansluten = true;
    const t0 = Date.now();
    serial.connect();
    await vi.waitFor(() => expect(p.st.oppnade).toBe(2), { timeout: 2000 });
    await vi.waitFor(() => expect(fixar.length).toBeGreaterThan(fore), { timeout: 2000 });
    expect(Date.now() - t0).toBeLessThan(2000);
    h.stop();
  });

  it("connect medan den gamla läsaren ännu avslutas: startar om direkt när den är klar, aldrig två läsare samtidigt", async () => {
    const { p, serial, h } = await starta();
    const fore = p.st.oppnade;
    serial.connect();                          // porten lever: ingen andra öppning
    await new Promise((r) => setTimeout(r, 50));
    expect(p.st.oppnade).toBe(fore);
    h.stop();
  });

  it("första open() efter connect misslyckas (Windows annonserar före porten går att öppna): omförsök på ~1 s, inte 10 s", async () => {
    const { p, serial, h } = await starta();
    p.dra();
    await vi.waitFor(() => expect(p.port.close).toHaveBeenCalled());
    serial.connect();                          // fortfarande ej öppningsbar
    await new Promise((r) => setTimeout(r, 100));
    expect(p.st.oppnade).toBe(1);
    p.st.ansluten = true;
    await vi.waitFor(() => expect(p.st.oppnade).toBe(2), { timeout: 2500 });
    h.stop();
  });

  it("utan connect-händelse finns reservtimern kvar (10 s) — inget regredierar", async () => {
    vi.useFakeTimers();
    const p = fakePort();
    const serial = fakeSerial([p.port]);
    const m = new Map<string, string>([["gps-serial-vald", "1"]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
    vi.stubGlobal("navigator", { serial });
    const g = await importera();
    const h = g.startaGpsKalla(() => {});
    await vi.advanceTimersByTimeAsync(50);
    p.dra();
    await vi.advanceTimersByTimeAsync(50);
    p.st.ansluten = true;
    await vi.advanceTimersByTimeAsync(9000);
    expect(p.st.oppnade).toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(p.st.oppnade).toBe(2);
    h.stop();
  });

  it("stop() tar bort lyssnaren och en connect efteråt öppnar ingenting", async () => {
    const { p, serial, h } = await starta();
    expect(serial.antal()).toBe(1);
    h.stop();
    expect(serial.antal()).toBe(0);
    serial.connect();
    await new Promise((r) => setTimeout(r, 50));
    expect(p.st.oppnade).toBe(1);
  });
});

describe("källvakt", () => {
  it("serial-grenen lyssnar på connect och städar lyssnaren i stop(); reservtimern på 10 s finns kvar", async () => {
    const { readFileSync } = await import("node:fs");
    const k = readFileSync("lib/gpsKalla.ts", "utf8");
    expect(k).toContain("serial.addEventListener?.('connect', vidConnect)");
    expect(k).toContain("serial.removeEventListener?.('connect', vidConnect)");
    expect(k).toContain("setTimeout(() => { pagaende = kor(); }, vantaMs)");
    expect(k).toContain(": 10000;");
  });
});
