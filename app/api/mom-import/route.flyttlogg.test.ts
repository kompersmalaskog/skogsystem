/**
 * mom-import: lastbilsflytt (flyttloggen, maskin_flytt) ger förarens flyttrad (beslut Martin 2026-10-19).
 * Fake-databasen delas i form med route.flytt.test.ts (GPS-raden).
 *
 * (Nedan: det ursprungliga resonemanget om GPS-raden, som gäller även här: raden är ett SEGMENT inom förarens redan betalda
 * dag, så lönen är oförändrad.)
 *
 * Synken bygger arbetsdagen ur fakt_skift (förarens inloggade tid, redan betald). En flytt är en lucka i maskinens
 * GPS-spår mellan två objekt (RPC flytt_luckor) och ≥ 30 min OCH ≥ 2 km. Raden skrivs som ett SEGMENT
 * (arbetsdag_segment, kalla 'flytt') — märkning av tid som redan ligger i arbetad_min. Lönen läser aldrig segment, så
 * arbetad_min ska vara byte för byte densamma med och utan flyttraden.
 *
 * Gäller bara dagar synken själv bygger. Bekräftade och redigerade dagar rörs aldrig.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as any;

vi.mock("@supabase/supabase-js", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    mode: "select" | "update" | "insert" | "delete" = "select";
    vals: any = null;
    constructor(public t: string) {}
    select() { return this; }
    order() { return this; }
    limit() { return this; }
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
    is(k: string, v: any) { this.f.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
    or(expr: string) {
      const delar = expr.split(",").map(p => p.split("."));
      this.f.push(r => delar.some(([col, op, val]) => (op === "is" && val === "null" ? r[col] == null : String(r[col]) === val)));
      return this;
    }
    update(v: any) { this.mode = "update"; this.vals = v; return this; }
    insert(v: any) { this.mode = "insert"; this.vals = v; return this; }
    delete() { this.mode = "delete"; return this; }
    then(res: any, rej: any) {
      const db = g.__db as Record<string, any[]>;
      const tab = (db[this.t] = db[this.t] || []);
      let rader: any[];
      const fel = this.mode === "insert" ? g.__insertFel?.[this.t] : null;
      if (fel) {
        g.__skriv.push({ tabell: this.t, op: "insert-FEL", vals: this.vals });
        return Promise.resolve({ data: null, error: fel, count: 0 }).then(res, rej);
      }
      if (g.__kasta?.[this.t]) throw new Error("nätet föll: " + this.t);
      if (this.mode === "select" && g.__selectFel?.[this.t]) return Promise.resolve({ data: null, error: g.__selectFel[this.t], count: 0 }).then(res, rej);
      if (this.mode === "select") rader = tab.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
      else if (this.mode === "update") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        traff.forEach(r => Object.assign(r, this.vals));
        g.__skriv.push({ tabell: this.t, op: "update", vals: this.vals });
        rader = traff.map(r => ({ ...r }));
      } else if (this.mode === "delete") {
        const traff = tab.filter(r => this.f.every(fn => fn(r)));
        db[this.t] = tab.filter(r => !traff.includes(r));
        g.__skriv.push({ tabell: this.t, op: "delete", antal: traff.length });
        rader = traff.map(r => ({ ...r }));
      } else {
        const nya = (Array.isArray(this.vals) ? this.vals : [this.vals]).map((v: any, i: number) => {
          const rad: any = { id: `${this.t}-${tab.length + i}`, ...v };
          if (this.t === "arbetsdag" && v.start_tid && v.slut_tid) {
            const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
            rad.arbetad_min = min(v.slut_tid) - min(v.start_tid) - (v.rast_min || 0);
          }
          return rad;
        });
        tab.push(...nya);
        g.__skriv.push({ tabell: this.t, op: "insert", vals: nya.map((n: any) => ({ ...n })) });
        rader = nya;
      }
      return Promise.resolve({ data: rader, error: null, count: rader.length }).then(res, rej);
    }
  }
  return {
    createClient: () => ({
      from: (t: string) => new Q(t),
      rpc: (namn: string, args: any) => {
        g.__rpcAnrop.push({ namn, args });
        const h = g.__rpc?.[namn];
        return Promise.resolve(h ? h(args) : { data: null, error: { code: "PGRST202", message: `Could not find the function public.${namn}` } });
      },
    }),
  };
});

import { POST } from "./route";

const OSKAR = "med-oskar", MARTIN = "med-martin";
const DAG = "2026-10-12"; // måndag
const post = (datum = DAG) => POST(new Request("https://app.example/api/mom-import", { method: "POST", body: JSON.stringify({ datum }) }) as any);
const segmentInsatta = () => (g.__skriv as any[]).filter(s => s.tabell === "arbetsdag_segment" && s.op === "insert").flatMap(s => s.vals);
const arbetsdagFor = (med: string) => (g.__db.arbetsdag as any[]).find(r => r.medarbetare_id === med && r.datum === DAG);
const segment = () => g.__db.arbetsdag_segment as any[];

/** Sommartid (UTC+2): 12:30 lokal = 10:30Z. Lastbilen (Martin) hämtar R64428 12:30 och lämnar 13:50 (som GPS-luckan i route.flytt.test). */
const LOGGFLYTT = {
  id: "mf-1", maskin_id: "R64428", medarbetare_id: MARTIN, forare: "Martin Lindqvist", avbruten: false, flytt_typ: "produktion", flytt_km: 53,
  starttid: "2026-10-12T10:00:00+00:00", hamtad_tid: "2026-10-12T10:30:00+00:00", sluttid: "2026-10-12T11:50:00+00:00",
  fran_objekt_id: "obj-uuid-a", till_objekt_id: "obj-uuid-b", fran_plats_id: null, till_plats_id: null, extern_maskin: null,
};
const GPS_LUCKA = {
  fran_objekt_id: "11105602", till_objekt_id: "11183108",
  start_lokal: "2026-10-12T12:30:56.599841", slut_lokal: "2026-10-12T13:50:34.612849",
  fran_lat: 56.5571099, fran_lng: 14.6939483, till_lat: 56.5198142, till_lng: 14.6131424,
};

beforeEach(() => {
  g.__skriv = []; g.__rpcAnrop = []; g.__insertFel = {}; g.__selectFel = {}; g.__kasta = {};
  g.__rpc = { flytt_luckor: () => ({ data: [], error: null }) };
  g.__db = {
    operator_medarbetare: [{ operator_id: "R64428_8", medarbetare_id: OSKAR }, { operator_id: "R64428_9", medarbetare_id: MARTIN }],
    fakt_skift: [{
      id: 1, datum: DAG, maskin_id: "R64428", operator_id: "R64428_8",
      inloggning_tid: "2026-10-12T07:04:20.4+00:00", maskin_inloggning_tid: "2026-10-12T07:04:07+00:00",
      utloggning_tid: "2026-10-12T15:14:10.8+00:00", langd_sek: 29390, shift_key: "SYN_2026-10-12_R64428_8",
    }],
    fakt_tid: [
      { id: 1, datum: DAG, maskin_id: "R64428", operator_id: "R64428_8", objekt_id: "11105602", processing_sek: 16431, terrain_sek: 2032, other_work_sek: 0, rast_sek: 1139, engine_time_sek: 17640 },
      { id: 2, datum: DAG, maskin_id: "R64428", operator_id: "R64428_8", objekt_id: "11183108", processing_sek: 4799, terrain_sek: 299, other_work_sek: 0, rast_sek: 0, engine_time_sek: 4860 },
    ],
    dim_objekt: [{ objekt_id: "11105602", object_name: "Toftåsa gallring 2026" }, { objekt_id: "11183108", object_name: "Sandåsen gallring 2025" }],
    objekt: [{ id: "obj-uuid-a", namn: "Toftåsa gallring 2026" }, { id: "obj-uuid-b", namn: "Sandåsen gallring 2025" }],
    flyttplats: [{ id: "plats-1", namn: "Verkstan" }],
    maskin_flytt: [{ ...LOGGFLYTT }],
    arbetsdag: [], arbetsdag_objekt: [], arbetsdag_segment: [], arbetsdag_flytt_borta: [], notis_kö: [],
  };
});

describe("mom-import: lastbilsflytt ger förarens flyttrad", () => {
  it("Oskar 2026-10-12: raden 12:30–13:50, märkt flyttlogg med flyttens id, trakter och km — hos maskinföraren, inte lastbilsföraren", async () => {
    const svar = await post();
    expect(svar.status).toBe(200);
    const rader = segmentInsatta();
    expect(rader).toHaveLength(1);
    expect(rader[0]).toMatchObject({
      medarbetare_id: OSKAR, datum: DAG, start_tid: "12:30:00", slut_tid: "13:50:00",
      aktivitet_typ: "flytt", debiterbar: false, objekt_id: null, kalla: "flyttlogg", flytt_id: "mf-1",
    });
    expect(rader[0].kommentar).toBe("Toftåsa gallring 2026 → Sandåsen gallring 2025 · 53 km");
  });

  it("LÖN OFÖRÄNDRAD: arbetsdagen och objektfördelningen är byte för byte desamma med och utan flyttraden", async () => {
    await post();
    const med = { dag: { ...arbetsdagFor(OSKAR) }, obj: (g.__db.arbetsdag_objekt as any[]).map(({ id, arbetsdag_id, ...r }) => r) };
    expect(segment()).toHaveLength(1);
    g.__db.arbetsdag = []; g.__db.arbetsdag_objekt = []; g.__db.arbetsdag_segment = []; g.__db.maskin_flytt = [];
    await post();
    const utan = { dag: { ...arbetsdagFor(OSKAR) }, obj: (g.__db.arbetsdag_objekt as any[]).map(({ id, arbetsdag_id, ...r }) => r) };
    const rensa = ({ id, ...r }: any) => r;
    expect(rensa(med.dag)).toEqual(rensa(utan.dag));
    expect(med.dag.arbetad_min).toBe(471);
    expect(med.obj).toEqual(utan.obj);
    expect(segment()).toHaveLength(0);
  });

  it("raden ryms inom passet: aldrig före start eller efter slut (07:04–15:14)", async () => {
    g.__db.maskin_flytt = [{ ...LOGGFLYTT, hamtad_tid: "2026-10-12T04:00:00+00:00", sluttid: "2026-10-12T14:00:00+00:00" }]; // 06:00–16:00 lokal
    await post();
    const r = segmentInsatta();
    expect(r).toHaveLength(1);
    expect([r[0].start_tid, r[0].slut_tid]).toEqual(["07:04:00", "15:14:00"]);
  });

  it("synken kör var 5:e minut: andra körningen skapar ingen dubblett", async () => {
    await post(); await post();
    expect(segmentInsatta()).toHaveLength(1);
    expect(segment()).toHaveLength(1);
  });

  it("föraren har tagit bort raden (svep): gravstenen med flyttens id hindrar att den skapas igen", async () => {
    g.__db.arbetsdag_flytt_borta = [{ medarbetare_id: OSKAR, datum: DAG, flytt_id: "mf-1", start_tid: "12:30:00", slut_tid: "13:50:00" }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
  });

  it("föraren har ändrat tiden på raden: flyttens id känns igen och synken skriver ingen ny bredvid", async () => {
    g.__db.arbetsdag_segment = [{ id: "s-egen", medarbetare_id: OSKAR, datum: DAG, start_tid: "12:40:00", slut_tid: "13:30:00", aktivitet_typ: "flytt", kalla: "flyttlogg", flytt_id: "mf-1" }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
    expect(segment()).toHaveLength(1);
  });

  it("BEKRÄFTAD dag rörs aldrig: ingen flyttrad", async () => {
    g.__db.arbetsdag = [{ id: "ad-1", medarbetare_id: OSKAR, datum: DAG, start_tid: "07:04:00", slut_tid: "15:14:00", rast_min: 19, maskin_id: "R64428", redigerad: false, bekraftad: true }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
    expect((g.__db.arbetsdag as any[]).find(r => r.id === "ad-1")).toMatchObject({ rast_min: 19, bekraftad: true });
  });

  it("den förare vars dag är BEKRÄFTAD hade maskinen: raden går inte till en annan förare på samma maskin", async () => {
    // Oskar (bekräftad, 07:04–15:14) täcker mest av flytten 12:30–13:50; Martin (obekräftad, 13:00–18:00) täcker mindre.
    g.__db.fakt_skift = [
      { id: 1, datum: DAG, maskin_id: "A130743", operator_id: "R64428_8", inloggning_tid: "2026-10-12T07:04:00+00:00", maskin_inloggning_tid: "2026-10-12T07:04:00+00:00", utloggning_tid: "2026-10-12T15:14:00+00:00", langd_sek: 29400, shift_key: "100" },
      { id: 2, datum: DAG, maskin_id: "A130743", operator_id: "R64428_9", inloggning_tid: "2026-10-12T13:00:00+00:00", maskin_inloggning_tid: "2026-10-12T13:00:00+00:00", utloggning_tid: "2026-10-12T18:00:00+00:00", langd_sek: 18000, shift_key: "101" },
    ];
    g.__db.fakt_tid = [];
    g.__db.arbetsdag = [{ id: "ad-oskar", medarbetare_id: OSKAR, datum: DAG, start_tid: "07:04:00", slut_tid: "15:14:00", rast_min: 0, maskin_id: "A130743", redigerad: false, bekraftad: true }];
    g.__db.maskin_flytt = [{ ...LOGGFLYTT, maskin_id: "A130743" }];
    await post();
    expect(arbetsdagFor(MARTIN)).toBeTruthy(); // Martins dag byggdes
    expect(segmentInsatta()).toHaveLength(0);
  });

  it("REDIGERAD dag rörs aldrig", async () => {
    g.__db.arbetsdag = [{ id: "ad-1", medarbetare_id: OSKAR, datum: DAG, start_tid: "07:04:00", slut_tid: "15:14:00", rast_min: 19, maskin_id: "R64428", redigerad: true, bekraftad: false }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
  });

  it("flytt som startar efter 17:00 (lastning 17:30 lokal) ger ingen rad — då flyttar Martin/Joacim själva", async () => {
    g.__db.maskin_flytt = [{ ...LOGGFLYTT, hamtad_tid: "2026-10-12T15:30:00+00:00", sluttid: "2026-10-12T16:30:00+00:00" }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
  });

  it("flytt på helg ger ingen rad (lördag 2026-10-10)", async () => {
    const lord = "2026-10-10";
    g.__db.fakt_skift[0] = { ...g.__db.fakt_skift[0], datum: lord, inloggning_tid: "2026-10-10T07:04:20+00:00", utloggning_tid: "2026-10-10T15:14:10+00:00", shift_key: "SYN_2026-10-10_R64428_8" };
    g.__db.fakt_tid = g.__db.fakt_tid.map((r: any) => ({ ...r, datum: lord }));
    g.__db.maskin_flytt = [{ ...LOGGFLYTT, hamtad_tid: "2026-10-10T10:30:00+00:00", sluttid: "2026-10-10T11:50:00+00:00" }];
    await post(lord);
    expect(g.__db.arbetsdag.some((r: any) => r.datum === lord)).toBe(true);
    expect(segmentInsatta()).toHaveLength(0);
  });

  it("avbruten flytt och flytt utan lastningstid ger ingen rad", async () => {
    g.__db.maskin_flytt = [{ ...LOGGFLYTT, avbruten: true }, { ...LOGGFLYTT, id: "mf-2", hamtad_tid: null }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
  });

  it("flytt av en annan maskin ger ingen rad hos Oskar", async () => {
    g.__db.maskin_flytt = [{ ...LOGGFLYTT, maskin_id: "A030353" }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
  });

  it("två förare på maskinen: bara den vars pass täcker flytten får raden (Martin 15:14–20:00 efter Oskar)", async () => {
    g.__db.fakt_skift.push({
      id: 2, datum: DAG, maskin_id: "R64428", operator_id: "R64428_9",
      inloggning_tid: "2026-10-12T15:14:10.8+00:00", maskin_inloggning_tid: "2026-10-12T15:14:00+00:00",
      utloggning_tid: "2026-10-12T20:00:00+00:00", langd_sek: 17150, shift_key: "SYN_2026-10-12_R64428_9",
    });
    await post();
    expect(segmentInsatta().map(r => r.medarbetare_id)).toEqual([OSKAR]);
  });

  it("plats i stället för objekt: 'Verkstan' i kommentaren", async () => {
    g.__db.maskin_flytt = [{ ...LOGGFLYTT, till_objekt_id: null, till_plats_id: "plats-1" }];
    await post();
    expect(segmentInsatta()[0].kommentar).toBe("Toftåsa gallring 2026 → Verkstan · 53 km");
  });
});

describe("mom-import: lastbilsflytt och GPS-flytt är EN rad, aldrig två", () => {
  it("båda finner samma flytt i samma synk: bara flyttloggsraden skrivs (loggen går före GPS)", async () => {
    g.__rpc = { flytt_luckor: () => ({ data: [GPS_LUCKA], error: null }) };
    await post();
    expect(segment()).toHaveLength(1);
    expect(segment()[0]).toMatchObject({ kalla: "flyttlogg", flytt_id: "mf-1" });
  });

  it("GPS-raden finns redan från en tidigare synk: flyttloggen ersätter den (raderar GPS-raden, skriver sin egen)", async () => {
    g.__rpc = { flytt_luckor: () => ({ data: [GPS_LUCKA], error: null }) };
    g.__db.arbetsdag_segment = [{ id: "s-gps", medarbetare_id: OSKAR, datum: DAG, start_tid: "12:30:00", slut_tid: "13:50:00", aktivitet_typ: "flytt", kalla: "flytt", flytt_id: null }];
    await post();
    expect(segment()).toHaveLength(1);
    expect(segment()[0]).toMatchObject({ kalla: "flyttlogg", flytt_id: "mf-1" });
    expect((g.__skriv as any[]).some(s => s.tabell === "arbetsdag_segment" && s.op === "delete")).toBe(true);
  });

  it("GPS-raden för en ANNAN flytt samma dag (13:30 senare) rörs inte", async () => {
    g.__rpc = { flytt_luckor: () => ({ data: [], error: null }) };
    g.__db.arbetsdag_segment = [{ id: "s-gps", medarbetare_id: OSKAR, datum: DAG, start_tid: "14:00:00", slut_tid: "14:40:00", aktivitet_typ: "flytt", kalla: "flytt", flytt_id: null }];
    await post();
    expect(segment().map(s => s.id).includes("s-gps")).toBe(true);
    expect(segment()).toHaveLength(2);
  });

  it("föraren har tagit bort flyttloggsraden (svep): GPS-steget återskapar den inte under annan skepnad", async () => {
    g.__rpc = { flytt_luckor: () => ({ data: [GPS_LUCKA], error: null }) };
    g.__db.arbetsdag_flytt_borta = [{ medarbetare_id: OSKAR, datum: DAG, flytt_id: "mf-1", start_tid: "12:30:00", slut_tid: "13:50:00" }];
    await post();
    expect(segment()).toHaveLength(0);
  });

  it("en rad föraren lagt in själv på samma tid (brandvakt) behålls: varken ersätts eller skrivs flyttraden", async () => {
    g.__db.arbetsdag_segment = [{ id: "s-egen", medarbetare_id: OSKAR, datum: DAG, start_tid: "12:40:00", slut_tid: "13:00:00", aktivitet_typ: "brandkontroll", kalla: "forare", flytt_id: null }];
    await post();
    expect(segment()).toHaveLength(1);
    expect(segment()[0].id).toBe("s-egen");
  });
});

describe("mom-import: flyttloggssteget får aldrig stoppa synken (migrationen körs av Martin, efter koden)", () => {
  it("flyttloggen går inte att läsa: ingen rad, dagen byggs, GPS-steget går sin väg", async () => {
    g.__selectFel = { maskin_flytt: { code: "XX000", message: "boom" } };
    g.__rpc = { flytt_luckor: () => ({ data: [GPS_LUCKA], error: null }) };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
    // GPS-raden är en annan källa och påverkas inte av att loggen inte gick att läsa
    expect(segment().every(s => s.kalla === "flytt")).toBe(true);
  });
  it("gravstenarna går inte att läsa (flytt_id saknas): INGEN flyttloggsrad — hellre ingen än en som kommer tillbaka", async () => {
    g.__selectFel = { arbetsdag_flytt_borta: { code: "42703", message: "column flytt_id does not exist" } };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(segmentInsatta()).toHaveLength(0);
  });
  it("befintliga segment går inte att läsa: ingen flyttloggsrad", async () => {
    g.__selectFel = { arbetsdag_segment: { code: "42703", message: "column flytt_id does not exist" } };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(segmentInsatta()).toHaveLength(0);
  });
  it("kalla-CHECK saknar 'flyttlogg' (migrationen ej körd): insert avvisas, dagen byggs ändå", async () => {
    g.__insertFel = { arbetsdag_segment: { code: "23514", message: 'violates check constraint "arbetsdag_segment_kalla_check"' } };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
    expect(segment()).toHaveLength(0);
  });
  it("en annan synk hann före (unikt per flytt, 23505) eller något överlappar (23P01): hoppas över tyst, ingen varning om migration", async () => {
    const varna = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const code of ["23505", "23P01"]) {
      g.__db.arbetsdag = []; g.__db.arbetsdag_objekt = []; g.__db.arbetsdag_segment = [];
      g.__insertFel = { arbetsdag_segment: { code, message: "krock" } };
      const svar = await post();
      expect(svar.status).toBe(200);
    }
    expect(varna.mock.calls.some(c => /flyttraden kunde inte skrivas/.test(String(c[0])))).toBe(false);
    varna.mockRestore();
  });
  it("namnen går inte att läsa: raden skrivs ändå, med 'Okänd plats' (aldrig ett id)", async () => {
    g.__selectFel = { objekt: { code: "XX000", message: "boom" } };
    await post();
    expect(segmentInsatta()[0].kommentar).toBe("Okänd plats → Okänd plats · 53 km");
  });
  it("flyttsteget kastar (nätet föll mitt i): dagen byggs ändå, synken svarar 200", async () => {
    const varna = vi.spyOn(console, "warn").mockImplementation(() => {});
    g.__kasta = { maskin_flytt: true };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
    expect(varna.mock.calls.some(c => /steget föll/.test(String(c[0])))).toBe(true);
    varna.mockRestore();
  });
  it("ingen flyttlogg alls: dagen byggs som vanligt", async () => {
    g.__db.maskin_flytt = undefined;
    g.__selectFel = {};
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
  });
});
