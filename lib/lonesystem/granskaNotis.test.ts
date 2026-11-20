// Lönenotiserna (Admin → Lön, Martin 2026-10-21): "Granska din <månad> – lönen skickas när du godkänt".
//   den 1:a kl 18 (svensk tid) till alla förare med lönerader · påminnelse 2 dagar senare om ej godkänt · knappen "Påminn" = samma notis direkt
//   · lon_andrad när en godkänd månad ändrats (köas av databasen). Aldrig till företagsledare.
// Texten byggs FÄRSKT vid utskick: är månaden redan godkänd/skickad skickas ingenting; ett läsfel lämnar raden oskickad.
import { describe, it, expect } from "vitest";
import {
  LON_GRANSKA, LON_PAMINNELSE, LON_ANDRAD, arLonNotis, byggLonNotis, lonNotisSchema, koaLonNotiser, koaManuellPaminnelse, manuellDedup, LON_MAX_ALDER_MS,
  type LonNotisRad,
} from "./granskaNotis";

const nu = Date.parse("2026-10-03T16:30:00Z");
const rad = (o: Partial<LonNotisRad> = {}): LonNotisRad => ({ godkand: false, skickad: false, foretagsledare: false, ...o });
const hamta = (r: LonNotisRad | null, fel?: string) => async () => ({ rad: r, fel });
const n = (typ: string, extra: any = {}) => ({ typ, payload: { arbetsmanad: "2026-09" }, skapad_at: new Date(nu - 60_000).toISOString(), ...extra });

describe("typer", () => {
  it("känner igen de tre typerna och inget annat", () => {
    expect([LON_GRANSKA, LON_PAMINNELSE, LON_ANDRAD].every(arLonNotis)).toBe(true);
    expect(arLonNotis("ledighet_beslut")).toBe(false);
    expect(arLonNotis(undefined)).toBe(false);
  });
});

describe("texten byggs färskt", () => {
  it("granska: arbetsmånadens namn (inte löneperiodens), länk till Lön-fliken", async () => {
    const u: any = await byggLonNotis(n(LON_GRANSKA), hamta(rad()), nu);
    expect(u.typ).toBe("skicka");
    expect(u.meddelande).toMatchObject({ title: "Lön", body: "Granska din september – lönen skickas när du godkänt", url: "/arbetsrapport?steg=lon&manad=2026-09" });
  });
  it("påminnelse och ändrad har egen text", async () => {
    expect(((await byggLonNotis(n(LON_PAMINNELSE), hamta(rad()), nu)) as any).meddelande.body).toBe("Du har inte godkänt din september än – lönen skickas när du godkänt");
    expect(((await byggLonNotis(n(LON_ANDRAD), hamta(rad()), nu)) as any).meddelande.body).toBe("Din september ändrades efter ditt godkännande – granska och godkänn igen");
  });
  it("årsskifte: december skrivs december", async () => {
    const u: any = await byggLonNotis(n(LON_GRANSKA, { payload: { arbetsmanad: "2026-12" } }), hamta(rad()), nu);
    expect(u.meddelande.body).toContain("din december");
  });
  it("taggen skiljer månad och typ, så en ny notis ersätter inte en annan månads", async () => {
    const a: any = await byggLonNotis(n(LON_GRANSKA), hamta(rad()), nu);
    const b: any = await byggLonNotis(n(LON_GRANSKA, { payload: { arbetsmanad: "2026-10" } }), hamta(rad()), nu);
    expect(a.meddelande.tag).not.toBe(b.meddelande.tag);
  });
});

describe("hoppas över när den inte längre är sann", () => {
  for (const typ of [LON_GRANSKA, LON_PAMINNELSE, LON_ANDRAD]) {
    it(`${typ}: redan godkänd → ingen notis`, async () => {
      expect((await byggLonNotis(n(typ), hamta(rad({ godkand: true })), nu)).typ).toBe("hoppa_over");
    });
    it(`${typ}: redan skickad till Fortnox → ingen notis`, async () => {
      expect((await byggLonNotis(n(typ), hamta(rad({ skickad: true })), nu)).typ).toBe("hoppa_over");
    });
    it(`${typ}: företagsledare får aldrig en lönenotis`, async () => {
      const u: any = await byggLonNotis(n(typ), hamta(rad({ foretagsledare: true })), nu);
      expect(u.typ).toBe("hoppa_over");
      expect(u.orsak).toMatch(/företagsledare/i);
    });
    it(`${typ}: mottagaren finns inte → ingen notis`, async () => {
      expect((await byggLonNotis(n(typ), hamta(null), nu)).typ).toBe("hoppa_over");
    });
    it(`${typ}: ett LÄSFEL lämnar raden oskickad (uppskjut) — det är inte 'finns inte'`, async () => {
      expect((await byggLonNotis(n(typ), hamta(null, "timeout"), nu)).typ).toBe("uppskjut");
    });
    it(`${typ}: saknad eller ogiltig arbetsmånad → ingen notis`, async () => {
      for (const payload of [{}, { arbetsmanad: "september" }, { arbetsmanad: "2026-13" }, null]) {
        expect((await byggLonNotis(n(typ, { payload }), hamta(rad()), nu)).typ, JSON.stringify(payload)).toBe("hoppa_over");
      }
    });
  }
  it("för gammal (köad för mer än 24 h sedan) skickas aldrig — och läses inte ens", async () => {
    let lasningar = 0;
    const gammal = n(LON_GRANSKA, { skapad_at: new Date(nu - LON_MAX_ALDER_MS - 1000).toISOString() });
    expect((await byggLonNotis(gammal, async () => { lasningar++; return { rad: rad() }; }, nu)).typ).toBe("hoppa_over");
    expect(lasningar).toBe(0);
  });
  it("precis under gränsen skickas", async () => {
    const f = n(LON_GRANSKA, { skapad_at: new Date(nu - LON_MAX_ALDER_MS + 1000).toISOString() });
    expect((await byggLonNotis(f, hamta(rad()), nu)).typ).toBe("skicka");
  });
});

// ── Schemat: vilka notiser gäller just nu? (svensk tid; sommar- och vintertid) ──────────────────────────────
describe("schema (svensk tid)", () => {
  const ar = (iso: string) => lonNotisSchema(new Date(iso));
  it("den 1:a kl 18:00 svensk sommartid (16:00 UTC) → granska för föregående månad", () => {
    expect(ar("2026-10-01T16:00:00Z")).toEqual([{ typ: LON_GRANSKA, arbetsmanad: "2026-09", dedup: "granska:2026-09" }]);
  });
  it("den 1:a kl 17:59 → inget (före 18)", () => {
    expect(ar("2026-10-01T15:59:00Z")).toEqual([]);
  });
  it("den 1:a hela kvällen (fönstret 18–24) → samma notis, dedup tar resten", () => {
    expect(ar("2026-10-01T21:59:00Z")).toHaveLength(1);
  });
  it("vintertid: 18:00 svensk tid = 17:00 UTC; 16:59 UTC är 17:59", () => {
    expect(ar("2026-11-01T17:00:00Z")).toEqual([{ typ: LON_GRANSKA, arbetsmanad: "2026-10", dedup: "granska:2026-10" }]);
    expect(ar("2026-11-01T16:59:00Z")).toEqual([]);
  });
  it("kvällen den 1:a efter midnatt svensk tid är den 2:a → inget (UTC-datum är fel mått)", () => {
    expect(ar("2026-10-01T22:30:00Z")).toEqual([]);
    expect(ar("2026-10-02T12:00:00Z")).toEqual([]);
  });
  it("den 3:e kl 18 → påminnelse för samma månad (två dagar senare)", () => {
    expect(ar("2026-10-03T16:00:00Z")).toEqual([{ typ: LON_PAMINNELSE, arbetsmanad: "2026-09", dedup: "paminn:2026-09" }]);
    expect(ar("2026-10-03T15:59:00Z")).toEqual([]);
  });
  it("årsskifte: 1 januari → december förra året", () => {
    expect(ar("2027-01-01T17:00:00Z")).toEqual([{ typ: LON_GRANSKA, arbetsmanad: "2026-12", dedup: "granska:2026-12" }]);
  });
  it("andra dagar i månaden → inget", () => {
    for (const d of ["2026-10-02", "2026-10-04", "2026-10-15", "2026-10-31"]) expect(ar(`${d}T17:00:00Z`)).toEqual([]);
  });
});

// ── Köaren ─────────────────────────────────────────────────────────────────────────────────────────────────────
function fakeSb(opt: { ins?: any[]; fel?: string } = {}) {
  const skrivet: any[] = [];
  return {
    skrivet,
    from(t: string) {
      return {
        upsert(rader: any[], o: any) { skrivet.push({ t, rader, o }); return { select: async () => (opt.fel ? { data: null, error: { message: opt.fel } } : { data: rader.map(r => ({ mottagare_id: r.mottagare_id })), error: null }) }; },
        select() { return { eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) } as any; },
      };
    },
  };
}
const forare = (id: string, o: any = {}) => ({ medarbetare_id: id, namn: id, rader: [{ x: 1 }], status: "utkast", godkannande: "vantar", foretagsledare: false, ...o });
const underlag = (rader: any[]) => async () => rader;
const T1 = new Date("2026-10-01T16:30:00Z"), T3 = new Date("2026-10-03T16:30:00Z");

describe("köaren", () => {
  it("den 1:a: en notis per förare med lönerader — inte företagsledare, inte redan skickade, inte förare utan rader", async () => {
    const sb = fakeSb();
    const r = await koaLonNotiser(sb, { nu: T1, dry: false, hamtaUnderlag: underlag([
      forare("a"), forare("b", { godkannande: "godkand" }), forare("l", { foretagsledare: true }), forare("s", { status: "skickat" }), forare("tom", { rader: [] }),
    ]) });
    expect(r.ok).toBe(true);
    expect(sb.skrivet).toHaveLength(1);
    expect(sb.skrivet[0].t).toBe("notis_kö");
    expect(sb.skrivet[0].rader.map((x: any) => x.mottagare_id).sort()).toEqual(["a", "b"]);
    for (const x of sb.skrivet[0].rader) expect(x).toMatchObject({ typ: LON_GRANSKA, payload: { arbetsmanad: "2026-09" }, dedup_nyckel: "granska:2026-09" });
  });
  it("köas med skickas_at 'infinity' (den gamla flushen på production skickar okända typer som generisk notis)", async () => {
    const sb = fakeSb();
    await koaLonNotiser(sb, { nu: T1, dry: false, hamtaUnderlag: underlag([forare("a")]) });
    expect(sb.skrivet[0].rader[0].skickas_at).toBe("infinity");
  });
  it("dubbletter ignoreras av databasen (onConflict på typ, mottagare, dedup)", async () => {
    const sb = fakeSb();
    await koaLonNotiser(sb, { nu: T1, dry: false, hamtaUnderlag: underlag([forare("a")]) });
    expect(sb.skrivet[0].o).toMatchObject({ onConflict: "typ,mottagare_id,dedup_nyckel", ignoreDuplicates: true });
  });
  it("den 3:e: påminnelse bara till dem som INTE godkänt", async () => {
    const sb = fakeSb();
    await koaLonNotiser(sb, { nu: T3, dry: false, hamtaUnderlag: underlag([forare("a"), forare("b", { godkannande: "godkand" })]) });
    expect(sb.skrivet[0].rader.map((x: any) => [x.mottagare_id, x.typ, x.dedup_nyckel])).toEqual([["a", LON_PAMINNELSE, "paminn:2026-09"]]);
  });
  it("andra dagar: inget köas och underlaget läses inte", async () => {
    const sb = fakeSb();
    let las = 0;
    const r = await koaLonNotiser(sb, { nu: new Date("2026-10-10T16:30:00Z"), dry: false, hamtaUnderlag: async () => { las++; return []; } });
    expect(r.ok).toBe(true);
    expect(sb.skrivet).toEqual([]);
    expect(las).toBe(0);
  });
  it("torrkörning rapporterar men skriver ingenting", async () => {
    const sb = fakeSb();
    const r = await koaLonNotiser(sb, { nu: T1, dry: true, hamtaUnderlag: underlag([forare("a")]) });
    expect(r.kandidater).toEqual([{ typ: LON_GRANSKA, arbetsmanad: "2026-09", mottagare: ["a"] }]);
    expect(sb.skrivet).toEqual([]);
  });
  it("larm ska larma: ett läsfel i underlaget är ok:false med klartext (aldrig 'ingen att notifiera')", async () => {
    const sb = fakeSb();
    const r = await koaLonNotiser(sb, { nu: T1, dry: false, hamtaUnderlag: async () => { throw new Error("timeout"); } });
    expect(r.ok).toBe(false);
    expect(r.fel).toMatch(/timeout/);
  });
  it("ett skrivfel (t.ex. dedup-kolumnen saknas) är ok:false", async () => {
    const r = await koaLonNotiser(fakeSb({ fel: "boom" }), { nu: T1, dry: false, hamtaUnderlag: underlag([forare("a")]) });
    expect(r.ok).toBe(false);
    expect(r.fel).toMatch(/boom/);
  });
  it("underlaget läses för LÖNEperioden (arbetsmånad + 1)", async () => {
    let periodSomLastes = "";
    await koaLonNotiser(fakeSb(), { nu: T1, dry: false, hamtaUnderlag: async (p: string) => { periodSomLastes = p; return []; } });
    expect(periodSomLastes).toBe("2026-10");
  });
});

describe("Påminn-knappen (samma notis direkt)", () => {
  it("köar lon_granska till EN förare, med en dedup som släpper igenom en ny först efter tio minuter", async () => {
    expect(manuellDedup("2026-09", new Date("2026-10-05T10:00:00Z"))).toBe(manuellDedup("2026-09", new Date("2026-10-05T10:09:00Z")));
    expect(manuellDedup("2026-09", new Date("2026-10-05T10:00:00Z"))).not.toBe(manuellDedup("2026-09", new Date("2026-10-05T10:11:00Z")));
    expect(manuellDedup("2026-09", new Date("2026-10-05T10:00:00Z"))).toMatch(/^manuell:2026-09:/);
  });
  it("köar för en väntande förare", async () => {
    const sb = fakeSb();
    const r = await koaManuellPaminnelse(sb, { medarbetareId: "a", arbetsmanad: "2026-09", nu: T3, lasRad: hamta(rad()) });
    expect(r).toMatchObject({ ok: true, koad: true });
    expect(sb.skrivet[0].rader).toEqual([expect.objectContaining({ mottagare_id: "a", typ: LON_GRANSKA, skickas_at: "infinity", payload: { arbetsmanad: "2026-09", manuell: true } })]);
  });
  it("nekar företagsledare, redan godkända och redan skickade — med en förklaring, utan att köa", async () => {
    for (const [r, orsak] of [[rad({ foretagsledare: true }), /företagsledare/i], [rad({ godkand: true }), /godkänt/i], [rad({ skickad: true }), /skickad/i]] as const) {
      const sb = fakeSb();
      const u = await koaManuellPaminnelse(sb, { medarbetareId: "a", arbetsmanad: "2026-09", nu: T3, lasRad: hamta(r) });
      expect(u.ok).toBe(false);
      expect(u.fel).toMatch(orsak);
      expect(sb.skrivet).toEqual([]);
    }
  });
  it("okänd förare och läsfel är fel, inte tystnad", async () => {
    expect((await koaManuellPaminnelse(fakeSb(), { medarbetareId: "x", arbetsmanad: "2026-09", nu: T3, lasRad: hamta(null) })).ok).toBe(false);
    expect((await koaManuellPaminnelse(fakeSb(), { medarbetareId: "x", arbetsmanad: "2026-09", nu: T3, lasRad: hamta(null, "timeout") })).fel).toMatch(/timeout/);
  });
  it("ogiltig arbetsmånad avvisas", async () => {
    expect((await koaManuellPaminnelse(fakeSb(), { medarbetareId: "a", arbetsmanad: "i går", nu: T3, lasRad: hamta(rad()) })).ok).toBe(false);
  });
  it("en andra tryckning inom tio minuter köar ingen ny (databasen släpper den) och säger det", async () => {
    const sb: any = fakeSb();
    sb.from = () => ({ upsert: () => ({ select: async () => ({ data: [], error: null }) }) });
    const r = await koaManuellPaminnelse(sb, { medarbetareId: "a", arbetsmanad: "2026-09", nu: T3, lasRad: hamta(rad()) });
    expect(r).toMatchObject({ ok: true, koad: false });
  });
});
