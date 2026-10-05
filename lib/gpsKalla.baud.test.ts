import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// BAUDRATEN: valbar per enhet (GPS-källa-kortet), används vid port.open, och Auto provar högst först vid portval.
// Drivern testas mot en fejkad Web Serial-port som skriver ned varje open({baudRate}) och levererar NMEA beroende på baudrate.
// Varje test får en ny kopia av modulen (hubben i gpsKalla har modul-state).

const rad = (kropp: string) => {
  let cs = 0;
  for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i);
  return "$" + kropp + "*" + cs.toString(16).toUpperCase().padStart(2, "0");
};
/** GGA + RMC med mätningens tid = `tidMs` (UTC). */
const nmeaVid = (tidMs: number) => {
  const d = new Date(tidMs);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  const hhmmss = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.00`;
  const ddmmyy = `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${p(d.getUTCFullYear() % 100)}`;
  return [
    rad(`GNGGA,${hhmmss},5621.387889,N,01502.992016,E,1,09,0.7,102.6,M,36.0,M,,`),
    rad(`GNRMC,${hhmmss},A,5621.387889,N,01502.992016,E,0.0,72.9,${ddmmyy},1.7,E,A,V`),
  ].join("\r\n") + "\r\n";
};
const GARBAGE = "ÿþ skräp\r\n$GPGGA,trasig*00\r\n";

function lagring(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    _m: m,
  };
}

/** Fejkad serieport. `leverans(baud)` ger texten porten skickar i den första läsningen (tom = tyst port); därefter blockerar read()
 *  tills reader.cancel() anropas — som en riktig port utan nya data. */
function fakePort(leverans: (baud: number) => string, opts: { oppnaKastar?: boolean } = {}) {
  const st = { baud: 0 };
  const open = vi.fn(async (o: { baudRate: number }) => { if (opts.oppnaKastar) throw new Error("upptagen"); st.baud = o.baudRate; });
  const close = vi.fn(async () => { /* */ });
  const port = {
    open, close,
    readable: {
      getReader() {
        let avbruten = false, skickad = false;
        let vantar: ((r: { value?: Uint8Array; done: boolean }) => void) | null = null;
        return {
          read: () => new Promise<{ value?: Uint8Array; done: boolean }>((res) => {
            if (avbruten) return res({ done: true });
            if (!skickad) { skickad = true; const t = leverans(st.baud); if (t) return res({ value: new TextEncoder().encode(t), done: false }); }
            vantar = res;
          }),
          cancel: async () => { avbruten = true; if (vantar) vantar({ done: true }); },
          releaseLock() { /* */ },
        };
      },
    },
  };
  return { port, open, close, oppnadeBaud: () => open.mock.calls.map((c) => c[0].baudRate) };
}

const importera = async () => { vi.resetModules(); return await import("./gpsKalla"); };
const installera = (ls: Record<string, string>, serial: any) => {
  const l = lagring(ls);
  vi.stubGlobal("localStorage", l);
  vi.stubGlobal("navigator", { serial });
  return l;
};

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("baudraten som valts i kortet används vid port.open (källan)", () => {
  const kor = async (ls: Record<string, string>) => {
    const p = fakePort(() => nmeaVid(Date.now() - 5000));
    installera({ "gps-serial-vald": "1", ...ls }, { getPorts: async () => [p.port] });
    const g = await importera();
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    await vi.waitFor(() => expect(p.open).toHaveBeenCalled());
    return { p, g, h, fixar };
  };

  it("38400 valt → port.open({ baudRate: 38400 })", async () => {
    const { p, h, fixar } = await kor({ "gps-serial-baud": "38400" });
    expect(p.open).toHaveBeenCalledWith({ baudRate: 38400 });
    expect(p.oppnadeBaud()).toEqual([38400]);
    await vi.waitFor(() => expect(fixar.some((f) => f.giltig)).toBe(true));   // och datat går igenom
    h.stop();
  });

  it("Standard utan sparat val: 4800 (som idag)", async () => {
    const { p, h } = await kor({});
    expect(p.oppnadeBaud()).toEqual([4800]);
    h.stop();
  });

  it("de fasta valen 9600 och 115200 används ordagrant", async () => {
    for (const b of [9600, 115200]) {
      const { p, h } = await kor({ "gps-serial-baud": String(b) });
      expect(p.oppnadeBaud()).toEqual([b]);
      h.stop();
      await new Promise((r) => setTimeout(r, 20));
    }
  });

  it("Auto: den baudrate portvalet hittade används; utan hittad → 4800", async () => {
    const a = await kor({ "gps-serial-baud": "auto", "gps-serial-baud-hittad": "115200" });
    expect(a.p.oppnadeBaud()).toEqual([115200]);
    a.h.stop();
    await new Promise((r) => setTimeout(r, 20));
    const b = await kor({ "gps-serial-baud": "auto" });
    expect(b.p.oppnadeBaud()).toEqual([4800]);
    b.h.stop();
  });

  it("ogiltigt sparat värde ger aldrig en konstig baudrate — 4800", async () => {
    const { p, h } = await kor({ "gps-serial-baud": "12345", "gps-serial-baud-hittad": "999" });
    expect(p.oppnadeBaud()).toEqual([4800]);
    h.stop();
  });

  it("baudraten byts i kortet → källan öppnas om med den nya (porten stängs och öppnas på nytt)", async () => {
    const { p, g, h } = await kor({ "gps-serial-baud": "4800" });
    expect(p.oppnadeBaud()).toEqual([4800]);
    await g.sattBaudValOchStartaOm(115200);
    await vi.waitFor(() => expect(p.open).toHaveBeenCalledTimes(2));
    expect(p.oppnadeBaud()).toEqual([4800, 115200]);
    expect(p.close).toHaveBeenCalled();                    // den gamla öppningen stängdes innan den nya
    expect(localStorage.getItem("gps-serial-baud")).toBe("115200");
    h.stop();
  });
});

describe("åldersvakten genom hela drivern (serial → hub → abonnent)", () => {
  it("en uppbyggd kö med 2,5 h gamla meningar levereras i färsk takt men blir giltig=false + fordrojd=true", async () => {
    const p = fakePort(() => nmeaVid(Date.now() - 2.5 * 3600 * 1000));
    installera({ "gps-serial-vald": "1" }, { getPorts: async () => [p.port] });
    const g = await importera();
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    await vi.waitFor(() => expect(fixar.length).toBeGreaterThan(0));
    for (const f of fixar) { expect(f.giltig).toBe(false); expect(f.fordrojd).toBe(true); }
    expect(g.senasteGiltigaGpsFix()).toBeNull();           // startflödet / körvyn ser ingen position
    h.stop();
  });

  it("färska meningar → giltig, inte fördröjd", async () => {
    const p = fakePort(() => nmeaVid(Date.now() - 3000));
    installera({ "gps-serial-vald": "1" }, { getPorts: async () => [p.port] });
    const g = await importera();
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    await vi.waitFor(() => expect(fixar.some((f) => f.giltig)).toBe(true));
    expect(fixar.every((f) => !f.fordrojd)).toBe(true);
    expect(g.senasteGiltigaGpsFix()).not.toBeNull();
    h.stop();
  });
});

describe("valjSerialPort — portval med fast baudrate och Auto", () => {
  const valja = async (ls: Record<string, string>, p: ReturnType<typeof fakePort>, anrop?: (g: any) => Promise<any>) => {
    const l = installera(ls, { requestPort: async () => p.port, getPorts: async () => [p.port] });
    const g = await importera();
    const res = anrop ? await anrop(g) : await g.valjSerialPort();
    return { res, l, g };
  };
  const GILTIG = () => nmeaVid(Date.now());

  it("fast 38400 valt i kortet → porten öppnas med 38400 vid portvalet (och bara den)", async () => {
    const p = fakePort(GILTIG);
    const { res, l } = await valja({ "gps-serial-baud": "38400" }, p);
    expect(res.ok).toBe(true);
    expect(res.baud).toBe(38400);
    expect(p.oppnadeBaud()).toEqual([38400]);
    expect(l.getItem("gps-serial-vald")).toBe("1");        // flaggan sätts som förut
    expect(p.close).toHaveBeenCalledTimes(1);
  });

  it("fast 9600 på en länk som bara fungerar vid 38400 → fel som säger baudraten, ingen flagga", async () => {
    vi.useFakeTimers();
    const p = fakePort((b) => (b === 38400 ? GILTIG() : GARBAGE));
    installera({ "gps-serial-baud": "9600" }, { requestPort: async () => p.port });
    const g = await importera();
    const pr = g.valjSerialPort();
    await vi.advanceTimersByTimeAsync(6000);
    const res = await pr;
    expect(res.ok).toBe(false);
    expect(res.fel).toContain("9600");
    expect(p.oppnadeBaud()).toEqual([9600]);
    expect(localStorage.getItem("gps-serial-vald")).toBeNull();
  });

  it("AUTO på en riktig UART som bara fungerar vid 38400: provar 115200 (skräp) → 38400 (giltigt), sparar 38400 som hittad", async () => {
    const p = fakePort((b) => (b === 38400 ? GILTIG() : GARBAGE));
    vi.useFakeTimers();
    installera({ "gps-serial-baud": "auto" }, { requestPort: async () => p.port });
    const g = await importera();
    const provade: number[] = [];
    const pr = g.valjSerialPort((b: number) => provade.push(b));
    await vi.advanceTimersByTimeAsync(3000);
    const res = await pr;
    expect(res.ok).toBe(true);
    expect(res.baud).toBe(38400);
    expect(p.oppnadeBaud()).toEqual([115200, 38400]);
    expect(provade).toEqual([115200, 38400]);
    expect(localStorage.getItem("gps-serial-baud-hittad")).toBe("38400");
    expect(p.close).toHaveBeenCalledTimes(2);              // varje försök stängde porten
  });

  it("AUTO på en baud-agnostisk virtuell port (Eltima: allt är giltigt men strypt): högsta först → 115200 direkt", async () => {
    const p = fakePort(GILTIG);
    const { res, l } = await valja({ "gps-serial-baud": "auto" }, p);
    expect(res.ok).toBe(true);
    expect(res.baud).toBe(115200);
    expect(p.oppnadeBaud()).toEqual([115200]);
    expect(l.getItem("gps-serial-baud-hittad")).toBe("115200");
  });

  it("AUTO utan sparat val alls (nytt portval) provar automatiskt", async () => {
    const p = fakePort(GILTIG);
    const { res } = await valja({}, p);
    expect(res.ok).toBe(true);
    expect(res.baud).toBe(115200);
  });

  it("AUTO på en tyst port: alla fyra provas (högst först), varje försök tidsbegränsat — hänger aldrig — och felet nämner dem", async () => {
    vi.useFakeTimers();
    const p = fakePort(() => "");
    installera({ "gps-serial-baud": "auto" }, { requestPort: async () => p.port });
    const g = await importera();
    const pr = g.valjSerialPort();
    await vi.advanceTimersByTimeAsync(12000);
    const res = await pr;
    expect(res.ok).toBe(false);
    expect(p.oppnadeBaud()).toEqual([115200, 38400, 9600, 4800]);
    expect(p.close).toHaveBeenCalledTimes(4);
    expect(res.fel).toContain("115200");
    expect(res.fel).toContain("4800");
    expect(localStorage.getItem("gps-serial-baud-hittad")).toBeNull();
  });

  it("portval medan serial-källan redan KÖR: källan pausas (porten kan bara öppnas en gång), provningen öppnar den, källan startar om med den hittade baudraten", async () => {
    const p = fakePort(() => nmeaVid(Date.now() - 3000));
    installera({ "gps-serial-vald": "1", "gps-serial-baud": "auto" }, { getPorts: async () => [p.port], requestPort: async () => p.port });
    const g = await importera();
    const fixar: any[] = [];
    const h = g.startaGpsKalla((f) => fixar.push(f));
    await vi.waitFor(() => expect(p.open).toHaveBeenCalledTimes(1));     // källan öppnade med 4800 (ingen hittad än)
    const res = await g.valjSerialPort();
    expect(res).toMatchObject({ ok: true, baud: 115200 });
    await vi.waitFor(() => expect(p.open).toHaveBeenCalledTimes(3));
    expect(p.oppnadeBaud()).toEqual([4800, 115200, 115200]);             // källan, provet, källan igen — nu med 115200
    h.stop();
  });

  it("porten går inte att öppna (upptagen) → tydligt fel direkt, ingen baudrate-jakt", async () => {
    const p = fakePort(GILTIG, { oppnaKastar: true });
    const { res } = await valja({ "gps-serial-baud": "auto" }, p);
    expect(res.ok).toBe(false);
    expect(res.fel).toMatch(/öppna porten/);
    expect(p.open).toHaveBeenCalledTimes(1);
  });

  it("ingen port vald i webbläsarens dialog → 'Ingen port vald.'", async () => {
    installera({}, { requestPort: async () => { throw new Error("avbröt"); } });
    const g = await importera();
    expect(await g.valjSerialPort()).toEqual({ ok: false, fel: "Ingen port vald." });
  });
});
