/**
 * mom-import: maskinflytt som egen rad i förarens dag (beslut Martin 2026-10-19).
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
const DAG = "2026-10-12";
const post = (datum = DAG) => POST(new Request("https://app.example/api/mom-import", { method: "POST", body: JSON.stringify({ datum }) }) as any);
const segmentInsatta = () => (g.__skriv as any[]).filter(s => s.tabell === "arbetsdag_segment" && s.op === "insert").flatMap(s => s.vals);
const arbetsdagFor = (med: string) => (g.__db.arbetsdag as any[]).find(r => r.medarbetare_id === med && r.datum === DAG);

/** Oskars riktiga lucka 2026-10-12 12:30:56 → 13:50:34, Toftåsa → Sandåsen, 6,5 km — exakt det SQL-funktionens kropp ger i produktion (bara SELECT, 2026-10-19). */
const LUCKA = {
  fran_objekt_id: "11105602", till_objekt_id: "11183108",
  start_lokal: "2026-10-12T12:30:56.599841", slut_lokal: "2026-10-12T13:50:34.612849",
  fran_lat: 56.5571099, fran_lng: 14.6939483, till_lat: 56.5198142, till_lng: 14.6131424,
};

beforeEach(() => {
  g.__skriv = []; g.__rpcAnrop = []; g.__insertFel = {}; g.__selectFel = {};
  g.__rpc = { flytt_luckor: () => ({ data: [LUCKA], error: null }) };
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
    arbetsdag: [], arbetsdag_objekt: [], arbetsdag_segment: [], arbetsdag_flytt_borta: [], notis_kö: [],
  };
});

describe("mom-import: flytt som egen rad", () => {
  it("Oskar 2026-10-12: en flyttrad 12:30–13:50, inom passet, märkt flytt och inte fakturerbar", async () => {
    const svar = await post();
    expect(svar.status).toBe(200);
    const rader = segmentInsatta();
    expect(rader).toHaveLength(1);
    expect(rader[0]).toMatchObject({
      medarbetare_id: OSKAR, datum: DAG, start_tid: "12:30:00", slut_tid: "13:50:00",
      aktivitet_typ: "flytt", debiterbar: false, objekt_id: null, kalla: "flytt",
    });
    expect(rader[0].kommentar).toBe("Toftåsa gallring 2026 → Sandåsen gallring 2025 · 6,5 km");
  });

  it("en dag med produktion på bara ETT objekt gör inget GPS-anrop (förfilter: flytt mellan två objekt syns som arbete på båda)", async () => {
    g.__db.fakt_tid = (g.__db.fakt_tid as any[]).filter(r => r.objekt_id === "11105602");
    await post();
    expect(g.__rpcAnrop).toHaveLength(0);
    expect(segmentInsatta()).toHaveLength(0);
  });

  it("GPS-luckan hämtas för förarens maskin och dag med tröskeln 30 min (en källa: konstanten)", async () => {
    await post();
    expect(g.__rpcAnrop).toEqual([{ namn: "flytt_luckor", args: { p_maskin_id: "R64428", p_datum: DAG, p_min_min: 30 } }]);
  });

  it("LÖN OFÖRÄNDRAD: arbetad_min och arbetsdag_objekt är byte för byte desamma med och utan flyttraden", async () => {
    await post();
    const med = { dag: { ...arbetsdagFor(OSKAR) }, obj: (g.__db.arbetsdag_objekt as any[]).map(({ id, arbetsdag_id, ...r }) => r) };
    // samma dag igen, nu utan någon lucka
    g.__db.arbetsdag = []; g.__db.arbetsdag_objekt = []; g.__db.arbetsdag_segment = [];
    g.__rpc = { flytt_luckor: () => ({ data: [], error: null }) };
    await post();
    const utan = { dag: { ...arbetsdagFor(OSKAR) }, obj: (g.__db.arbetsdag_objekt as any[]).map(({ id, arbetsdag_id, ...r }) => r) };
    const rensa = ({ id, ...r }: any) => r;
    expect(rensa(med.dag)).toEqual(rensa(utan.dag));
    expect(med.dag.arbetad_min).toBe(471);
    expect(med.obj).toEqual(utan.obj);
  });

  it("synken lägger aldrig till tid: flyttraden ryms i arbetad_min (471 min ≥ 80 min flytt)", async () => {
    await post();
    const r = segmentInsatta()[0];
    const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    expect(min(r.slut_tid) - min(r.start_tid)).toBeLessThanOrEqual(arbetsdagFor(OSKAR).arbetad_min);
    expect(min(r.start_tid)).toBeGreaterThanOrEqual(min("07:04"));
    expect(min(r.slut_tid)).toBeLessThanOrEqual(min("15:14"));
  });

  it("andra körningen skapar ingen dubblett (synken kör var 5:e minut)", async () => {
    await post(); await post();
    expect(segmentInsatta()).toHaveLength(1);
    expect(g.__db.arbetsdag_segment).toHaveLength(1);
  });

  it("föraren har tagit bort raden: gravstenen hindrar att den skapas igen", async () => {
    g.__db.arbetsdag_flytt_borta = [{ medarbetare_id: OSKAR, datum: DAG, start_tid: "12:30:00", slut_tid: "13:50:00" }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
    expect(arbetsdagFor(OSKAR)).toBeTruthy(); // dagen byggs som vanligt
  });

  it("föraren har ändrat raden: synken skriver inte en ny bredvid", async () => {
    g.__db.arbetsdag_segment = [{ id: "s-egen", medarbetare_id: OSKAR, datum: DAG, start_tid: "12:40:00", slut_tid: "13:30:00", aktivitet_typ: "flytt", kalla: "flytt" }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
    expect(g.__db.arbetsdag_segment).toHaveLength(1);
  });

  it("BEKRÄFTAD dag rörs aldrig: ingen flyttrad och GPS-luckan hämtas inte ens", async () => {
    g.__db.arbetsdag = [{ id: "ad-1", medarbetare_id: OSKAR, datum: DAG, start_tid: "07:04:00", slut_tid: "15:14:00", rast_min: 19, maskin_id: "R64428", redigerad: false, bekraftad: true }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
    expect(g.__rpcAnrop).toHaveLength(0);
    expect((g.__db.arbetsdag as any[]).find(r => r.id === "ad-1")).toMatchObject({ rast_min: 19, bekraftad: true });
  });

  it("REDIGERAD dag rörs aldrig", async () => {
    g.__db.arbetsdag = [{ id: "ad-1", medarbetare_id: OSKAR, datum: DAG, start_tid: "07:04:00", slut_tid: "15:14:00", rast_min: 19, maskin_id: "R64428", redigerad: true, bekraftad: false }];
    await post();
    expect(segmentInsatta()).toHaveLength(0);
    expect(g.__rpcAnrop).toHaveLength(0);
  });

  it("flytten tillhör den förare som var inloggad: Martins pass efter Oskars får ingen rad från Oskars flytt", async () => {
    g.__db.fakt_skift.push({
      id: 2, datum: DAG, maskin_id: "R64428", operator_id: "R64428_9",
      inloggning_tid: "2026-10-12T15:14:10.8+00:00", maskin_inloggning_tid: "2026-10-12T15:14:00+00:00",
      utloggning_tid: "2026-10-12T20:00:00+00:00", langd_sek: 17150, shift_key: "SYN_2026-10-12_R64428_9",
    });
    await post();
    const rader = segmentInsatta();
    expect(rader.map(r => r.medarbetare_id)).toEqual([OSKAR]);
  });

  it("ett pass som bara delvis täcker flytten får bara den delen: flytt 14:40–16:00 mot slut 15:14", async () => {
    g.__rpc = { flytt_luckor: () => ({ data: [{ ...LUCKA, start_lokal: "2026-10-12T14:40:00", slut_lokal: "2026-10-12T16:00:00" }], error: null }) };
    await post();
    const r = segmentInsatta();
    expect(r).toHaveLength(1);
    expect([r[0].start_tid, r[0].slut_tid]).toEqual(["14:40:00", "15:14:00"]);
  });

  it("lucka under 30 min eller under 2 km ger ingen rad (RPC:n är bara en förfiltrering, regeln bor i koden)", async () => {
    g.__rpc = { flytt_luckor: () => ({ data: [
      { ...LUCKA, start_lokal: "2026-10-12T12:30:00", slut_lokal: "2026-10-12T12:59:59" },
      { ...LUCKA, start_lokal: "2026-10-12T10:00:00", slut_lokal: "2026-10-12T11:00:00", fran_lat: 56.55, fran_lng: 14.14, till_lat: LAT_NARA, till_lng: 14.14 },
    ], error: null }) };
    await post();
    expect(segmentInsatta()).toHaveLength(0);
  });
});

const LAT_NARA = 56.55 + 0.0179; // 1,99 km

describe("mom-import: flytt får aldrig stoppa synken (migrationen körs av Martin, efter koden)", () => {
  it("RPC:n finns inte än (migrationen ej körd): dagen byggs, ingen flyttrad, ingen krasch", async () => {
    g.__rpc = {}; // PGRST202
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
    expect(segmentInsatta()).toHaveLength(0);
  });
  it("RPC:n saknas: synken slutar fråga efter första felet (inte ett anrop per dag, var 5:e minut)", async () => {
    g.__rpc = {};
    const dag2 = "2026-10-11";
    g.__db.fakt_skift.push({
      id: 2, datum: dag2, maskin_id: "R64428", operator_id: "R64428_9",
      inloggning_tid: "2026-10-11T07:00:00+00:00", maskin_inloggning_tid: "2026-10-11T07:00:00+00:00",
      utloggning_tid: "2026-10-11T15:00:00+00:00", langd_sek: 28800, shift_key: "SYN_2026-10-11_R64428_9",
    });
    g.__db.fakt_tid.push(
      { id: 3, datum: dag2, maskin_id: "R64428", operator_id: "R64428_9", objekt_id: "11105602", processing_sek: 9000, terrain_sek: 0, other_work_sek: 0, rast_sek: 0, engine_time_sek: 9000 },
      { id: 4, datum: dag2, maskin_id: "R64428", operator_id: "R64428_9", objekt_id: "11183108", processing_sek: 9000, terrain_sek: 0, other_work_sek: 0, rast_sek: 0, engine_time_sek: 9000 },
    );
    const svar = await POST(new Request("https://app.example/api/mom-import", { method: "POST", body: "{}" }) as any);
    expect(svar.status).toBe(200);
    expect((g.__db.arbetsdag as any[]).length).toBe(2); // båda dagarna byggdes
    expect(g.__rpcAnrop).toHaveLength(1);
  });
  it("RPC:n kastar: dagen byggs ändå", async () => {
    g.__rpc = { flytt_luckor: () => { throw new Error("nätet föll"); } };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
  });
  it("kalla-CHECK saknar 'flytt' (migrationen ej körd): insert avvisas, dagen byggs ändå", async () => {
    g.__insertFel = { arbetsdag_segment: { code: "23514", message: 'new row for relation "arbetsdag_segment" violates check constraint "arbetsdag_segment_kalla_check"' } };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
    expect(g.__db.arbetsdag_segment).toHaveLength(0);
  });
  it("gravstenarna går inte att läsa (tabellen saknas): INGEN flyttrad skapas — hellre ingen än en som kommer tillbaka efter borttagning — men dagen byggs", async () => {
    g.__selectFel = { arbetsdag_flytt_borta: { code: "42P01", message: 'relation "arbetsdag_flytt_borta" does not exist' } };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(arbetsdagFor(OSKAR)).toBeTruthy();
    expect(segmentInsatta()).toHaveLength(0);
  });
  it("befintliga segment går inte att läsa: ingen flyttrad (kan inte veta vad som är upptaget)", async () => {
    g.__selectFel = { arbetsdag_segment: { code: "XX000", message: "boom" } };
    const svar = await post();
    expect(svar.status).toBe(200);
    expect(segmentInsatta()).toHaveLength(0);
  });
});
