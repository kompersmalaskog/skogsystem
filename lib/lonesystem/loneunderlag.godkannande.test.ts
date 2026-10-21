// Förarens godkännande genom hela underlaget (beraknaLoneunderlag): loneunderlag.status för ARBETSmånaden blir `godkannande` per förare.
// Exporten skickar bara de som godkänt (app/api/fortnox/salary-export), så den här avläsningen får aldrig gissa åt något håll:
//   - fel månad räknas inte (period "2026-09" hör till löneperiod 2026-10, inte 2026-09),
//   - NULL (nollställt av en ändring) och okänd status är "väntar",
//   - ett LÄSFEL stoppar underlaget — en tyst "ingen har godkänt" vore ett felaktigt stopp, en tyst "alla har" en felaktig sändning.
import { describe, it, expect } from "vitest";
import { beraknaLoneunderlag } from "./loneunderlag";
import { sepTabeller } from "./testdata/sepKlient";

type Rad = Record<string, any>;
class Fraga {
  private f: ((r: Rad) => boolean)[] = [];
  private enkel = false;
  private kolumner: string[] | null = null;
  constructor(private rader: Rad[], private fel: { code?: string; message: string } | null) {}
  select(kol?: string) { this.kolumner = kol && kol !== "*" ? kol.split(",").map(k => k.trim()) : null; return this; } order() { return this; } limit() { return this; } range() { return this; }
  eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
  in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
  gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
  lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
  maybeSingle() { this.enkel = true; return this; }
  kolumnerSomLases() { return this.kolumner; }
  then(res: any, rej: any) {
    if (this.fel) return Promise.resolve({ data: null, error: this.fel }).then(res, rej);
    const rader = this.rader.filter(r => this.f.every(fn => fn(r))).map(r => (this.kolumner ? Object.fromEntries(this.kolumner.filter(k => k in r).map(k => [k, r[k]])) : { ...r }));
    return Promise.resolve({ data: this.enkel ? rader[0] ?? null : rader, error: null }).then(res, rej);
  }
}

function klient(lu: Rad[], opt: { fel?: { code?: string; message: string }; utanNollstalldKolumner?: boolean } = {}) {
  const t = sepTabeller();
  t.loneunderlag = lu;
  const lasta: string[] = [];
  return {
    lasta,
    from(namn: string) {
      if (namn === "loneunderlag") {
        const q = new Fraga(t.loneunderlag, opt.fel ?? null);
        const orig = q.select.bind(q);
        q.select = (kol?: string) => {
          lasta.push(kol || "*");
          // Migrationen ej körd: PostgREST svarar 42703 (undefined_column) när select nämner en kolumn som inte finns.
          if (opt.utanNollstalldKolumner && /nollstalld/.test(kol || "")) (q as any).fel = { code: "42703", message: 'column "nollstalld_at" does not exist' };
          return orig(kol);
        };
        return q;
      }
      return new Fraga(t[namn], null);
    },
  };
}
const rad = (u: any, id: string) => u.resultat.find((r: any) => r.medarbetare_id === id);
const GODKAND = { medarbetare_id: "m4", period: "2026-09", status: "godkand_av_forare", skickat_tidpunkt: "2026-10-02T10:00:00Z", nollstalld_at: null, nollstalld_datum: null };

describe("förarens godkännande per förare", () => {
  it("ingen rad: alla väntar (stängt som standard)", async () => {
    const u: any = await beraknaLoneunderlag(klient([]), { period: "2026-10" });
    expect(u.resultat.length).toBeGreaterThan(0);
    expect(u.resultat.every((r: any) => r.godkannande === "vantar")).toBe(true);
  });

  it("godkand_av_forare för ARBETSmånaden: den föraren är godkänd, de andra väntar", async () => {
    const u: any = await beraknaLoneunderlag(klient([GODKAND]), { period: "2026-10" });
    expect(rad(u, "m4")).toMatchObject({ godkannande: "godkand", godkand_tid: "2026-10-02T10:00:00Z" });
    expect(rad(u, "m1").godkannande).toBe("vantar");
    expect(u.berikad.find((r: any) => r.medarbetare_id === "m4").godkannande).toBe("godkand");
  });

  it("äldre status 'inskickat' är också ett godkännande", async () => {
    const u: any = await beraknaLoneunderlag(klient([{ ...GODKAND, status: "inskickat" }]), { period: "2026-10" });
    expect(rad(u, "m4").godkannande).toBe("godkand");
  });

  it("fel månad räknas inte: ett godkännande av augusti gäller inte september", async () => {
    const u: any = await beraknaLoneunderlag(klient([{ ...GODKAND, period: "2026-08" }]), { period: "2026-10" });
    expect(rad(u, "m4").godkannande).toBe("vantar");
  });

  it("löneperioden är inte arbetsmånaden: period '2026-10' i loneunderlag hör till november-lönen, inte till oktober-lönen", async () => {
    const u: any = await beraknaLoneunderlag(klient([{ ...GODKAND, period: "2026-10" }]), { period: "2026-10" });
    expect(rad(u, "m4").godkannande).toBe("vantar");
  });

  it("NULL (nollställt av en ändring) och okända statusvärden är 'väntar' — och nollställningen syns", async () => {
    const nollstalld = { ...GODKAND, status: null, nollstalld_at: "2026-10-05T08:00:00Z", nollstalld_datum: "2026-09-10" };
    const u: any = await beraknaLoneunderlag(klient([nollstalld, { ...GODKAND, medarbetare_id: "m1", status: "utkast" }]), { period: "2026-10" });
    expect(rad(u, "m4")).toMatchObject({ godkannande: "vantar", godkand_tid: null, andrad_efter_godkannande: { at: "2026-10-05T08:00:00Z", datum: "2026-09-10" } });
    expect(rad(u, "m1")).toMatchObject({ godkannande: "vantar" });
    expect(rad(u, "m1").andrad_efter_godkannande ?? null).toBeNull();
  });

  it("en godkänd förare har ingen 'ändrad efter godkännande' även om kolumnen är kvar från en tidigare nollställning", async () => {
    const u: any = await beraknaLoneunderlag(klient([{ ...GODKAND, nollstalld_at: "2026-10-05T08:00:00Z", nollstalld_datum: "2026-09-10" }]), { period: "2026-10" });
    expect(rad(u, "m4").godkannande).toBe("godkand");
    expect(rad(u, "m4").andrad_efter_godkannande ?? null).toBeNull();
  });

  it("läser bara arbetsmånadens rader (eq period) — inte hela tabellen", async () => {
    const k = klient([GODKAND]);
    await beraknaLoneunderlag(k, { period: "2026-10" });
    expect(k.lasta.length).toBe(1);
  });

  it("ett läsfel stoppar underlaget (aldrig en tyst 'ingen har godkänt')", async () => {
    await expect(beraknaLoneunderlag(klient([], { fel: { code: "57014", message: "timeout" } }), { period: "2026-10" })).rejects.toThrow(/godkännande/);
  });

  it("migrationen ej körd (nollställningskolumnerna saknas): faller tillbaka på status och underlaget fungerar", async () => {
    const k = klient([GODKAND], { utanNollstalldKolumner: true });
    const u: any = await beraknaLoneunderlag(k, { period: "2026-10" });
    expect(rad(u, "m4").godkannande).toBe("godkand");
    expect(k.lasta.length).toBe(2);
    expect(k.lasta[1]).not.toMatch(/nollstalld/);
  });
});

// ── Ändrad EFTER att månaden skickats (Martin 2026-10-21) ──────────────────────────────────────────────────────────────────────
// Är månaden redan skickad nollställer en ändring inte godkännandet (databasen, migration 20261021100000) — den märks på exportloggraden
// (fortnox_export_logg.andrad_efter_skickat_*), och Admin visar "Ändrad efter att den skickats · 10 sep" så att det rättas i nästa lön.
describe("ändrad efter att månaden skickats", () => {
  // Loggens period är LÖNEperioden (som frågan period "2026-10"), medan godkännandet ovan hör till arbetsmånaden "2026-09".
  const SKICKAD = { medarbetare_id: "m4", period: "2026-10", status: "skickat", andrad_efter_skickat_at: "2026-10-12T09:30:00Z", andrad_efter_skickat_dagar: ["2026-09-10", "2026-09-12"] };

  function klientMedLogg(logg: Rad[], opt: { saknarKolumner?: boolean; fel?: { code?: string; message: string } } = {}) {
    const k: any = klient([GODKAND]);
    const t = sepTabeller();
    t.fortnox_export_logg = logg;
    const inre = k.from.bind(k);
    const lasta: string[] = [];
    k.loggLasta = lasta;
    k.from = (namn: string) => {
      if (namn !== "fortnox_export_logg") return inre(namn);
      const q: any = new Fraga(t.fortnox_export_logg, null);
      const orig = q.select.bind(q);
      q.select = (kol?: string) => {
        lasta.push(kol || "*");
        if (/andrad_efter_skickat/.test(kol || "")) {
          if (opt.fel) q.fel = opt.fel;
          else if (opt.saknarKolumner) q.fel = { code: "42703", message: 'column "andrad_efter_skickat_at" does not exist' };
        }
        return orig(kol);
      };
      return q;
    };
    return k;
  }

  it("skickad + ändrad efter: raden bär när och vilka dagar (i datumordning)", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([SKICKAD]), { period: "2026-10" });
    expect(rad(u, "m4").status).toBe("skickat");
    expect(rad(u, "m4").andrad_efter_skickat).toEqual({ at: "2026-10-12T09:30:00Z", dagar: ["2026-09-10", "2026-09-12"] });
    expect(u.berikad.find((r: any) => r.medarbetare_id === "m4").andrad_efter_skickat).toEqual({ at: "2026-10-12T09:30:00Z", dagar: ["2026-09-10", "2026-09-12"] });
  });

  it("skickad men aldrig ändrad: ingen märkning", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([{ ...SKICKAD, andrad_efter_skickat_at: null, andrad_efter_skickat_dagar: null }]), { period: "2026-10" });
    expect(rad(u, "m4").andrad_efter_skickat ?? null).toBeNull();
  });

  it("märkningen gäller bara en SKICKAD rad: en rad med status fel visar den inte", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([{ ...SKICKAD, status: "fel" }]), { period: "2026-10" });
    expect(rad(u, "m4").status).toBe("utkast");
    expect(rad(u, "m4").andrad_efter_skickat ?? null).toBeNull();
  });

  it("fel månad räknas inte: loggen för löneperiod 2026-09 (augusti-arbetet) syns inte på oktober-lönen", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([{ ...SKICKAD, period: "2026-09" }]), { period: "2026-10" });
    expect(rad(u, "m4").andrad_efter_skickat ?? null).toBeNull();
  });

  it("samma förare, två månader: en ändring efter att AUGUSTI skickats märker inte september (månadens egen rad avgör)", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([
      { medarbetare_id: "m4", period: "2026-10", status: "skickat", andrad_efter_skickat_at: null, andrad_efter_skickat_dagar: null },   // september: skickad, orörd
      { ...SKICKAD, period: "2026-09", andrad_efter_skickat_dagar: ["2026-08-04"] },                                                     // augusti: skickad och ändrad
    ]), { period: "2026-10" });
    expect(rad(u, "m4").status).toBe("skickat");
    expect(rad(u, "m4").andrad_efter_skickat ?? null).toBeNull();
  });

  it("en annan förares märkning hamnar aldrig på den här", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([{ ...SKICKAD, medarbetare_id: "m1" }]), { period: "2026-10" });
    expect(rad(u, "m1").andrad_efter_skickat).toBeTruthy();
    expect(rad(u, "m4").andrad_efter_skickat ?? null).toBeNull();
  });

  it("dagarna kommer ut sorterade och utan dubbletter, vad databasen än skickar", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([{ ...SKICKAD, andrad_efter_skickat_dagar: ["2026-09-12", "2026-09-10", "2026-09-10"] }]), { period: "2026-10" });
    expect(rad(u, "m4").andrad_efter_skickat.dagar).toEqual(["2026-09-10", "2026-09-12"]);
  });

  it("märkt med tid men utan dagar (äldre/ofullständig rad): märkningen finns ändå, dagarna är tomma — den döljs inte", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([{ ...SKICKAD, andrad_efter_skickat_dagar: null }]), { period: "2026-10" });
    expect(rad(u, "m4").andrad_efter_skickat).toEqual({ at: "2026-10-12T09:30:00Z", dagar: [] });
  });

  it("migrationen ej körd (kolumnerna saknas): underlaget fungerar, ingen märkning, ingen krasch", async () => {
    const u: any = await beraknaLoneunderlag(klientMedLogg([SKICKAD], { saknarKolumner: true }), { period: "2026-10" });
    expect(rad(u, "m4").status).toBe("skickat");
    expect(rad(u, "m4").andrad_efter_skickat ?? null).toBeNull();
  });

  it("ett annat läsfel stoppar underlaget (aldrig en tyst 'ingen ändring')", async () => {
    await expect(beraknaLoneunderlag(klientMedLogg([SKICKAD], { fel: { code: "57014", message: "timeout" } }), { period: "2026-10" })).rejects.toThrow(/skickad/i);
  });
});
