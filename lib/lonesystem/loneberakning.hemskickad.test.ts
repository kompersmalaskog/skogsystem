// Hemskickad (Martin 2026-10-17): maskinen gick sönder eller vädret stoppade jobbet och föraren skickades hem mitt på dagen.
//
//   - Dagen fylls upp till 8 tim: arbetad tid + hemskickad tid = 8.
//   - Hemskickad tid betalas som TIMLÖN (och därmed premie, som timlönen), räknas som arbetad tid mot månadens ordinarie och ger aldrig övertid.
//   - Den är ingen frånvaro: ingen "deldag", ingen frånvarorad, ingen löneart för sjukfrånvaro.
//
// Rena enhetstester — ingen databas. Raden är en ledighetsrad med typ 'hemskickad' och klockslaget föraren åkte hem; timmarna HÄRLEDS ur
// den arbetade tiden den dagen (arbetad_min + extra tid) och lagras aldrig. Minuter är heltal hela vägen, timmar med två decimaler i slutsumman.
import { describe, it, expect } from "vitest";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";
import { hemskickadMinuter, fmtTimMin, HEM_DAG_MIN, registreraFranvaro } from "../franvaro";

const TYP = { SK: "skordare" as const, ST: "skotare" as const };
const dag = (datum: string, min: number, maskin: string | null = "R64428") => ({ datum, arbetad_min: min, maskin_id: maskin, km_totalt: 0, bekraftad: true, dagtyp: null });
const hem = (datum: string, fran = "14:00") => ({ typ: "hemskickad", startdatum: datum, slutdatum: datum, fran_tid: fran, till_tid: null });
const sjuk = (datum: string, fran = "11:30") => ({ typ: "sjuk", startdatum: datum, slutdatum: datum, fran_tid: fran, till_tid: null });
const kor = (dagar: any[], ledigheter: any[] = [], extra: any[] = [], o: { foretagsledare?: boolean; ordinarieVeckaH?: number | null } = {}) =>
  beräknaExport("m", "Anna", "7", dagar, { R64428: TYP.SK, A030353: TYP.ST }, "2026-10", extra, ledigheter, 60, null, new Set(), o.ordinarieVeckaH ?? null, null, PROD_KODER, { foretagsledare: o.foretagsledare });
const mangd = (u: ReturnType<typeof kor>, art: string) => Number(u.rader.find(r => r.loneart === art)?.Number ?? 0);

describe("hemskickad: dagen fylls upp till 8 tim och betalas som timlön", () => {
  it("FACIT: 6 tim arbete + hemskickad kl 14 → 8 tim timlön, 0 övertid", () => {
    const u = kor([dag("2026-09-07", 360)], [hem("2026-09-07")]);
    expect(u.timlon_h).toBe(8);
    expect(mangd(u, "timlon")).toBe(8);
    expect(u.overtid_h).toBe(0);
    expect(u.rader.some(r => r.loneart.startsWith("overtid"))).toBe(false);
    expect(u.hemskickad).toEqual([{ datum: "2026-09-07", fran_tid: "14:00", arbetad_min: 360, minuter: 120, timmar: 2 }]);
    expect(u.hemskickad_h).toBe(2);
  });

  it("kontroll utan hemskickad: samma dag ger bara de 6 arbetade timmarna (inget fylls upp av sig självt)", () => {
    const u = kor([dag("2026-09-07", 360)]);
    expect(u.timlon_h).toBe(6);
    expect(u.hemskickad).toEqual([]);
    expect(u.hemskickad_h).toBe(0);
  });

  it("premien följer timlönen: den hemskickade tiden ger premie som varje annan timlönetimme", () => {
    const u = kor([dag("2026-09-07", 360)], [hem("2026-09-07")]);
    expect(u.premielon_skordare_h).toBe(8);
    expect(mangd(u, "premielon_skordare")).toBe(8);
    expect(u.premielon_skotare_h).toBe(0);
  });

  it("minuterna är heltal: 6 tim 7 min arbete → 113 min hemskickad, summan blir exakt 8,00", () => {
    const u = kor([dag("2026-09-07", 367)], [hem("2026-09-07")]);
    expect(u.hemskickad[0].minuter).toBe(113);
    expect(u.rader.find(r => r.loneart === "timlon")!.Number).toBe("8.00");
    expect(u.hemskickad_h).toBe(1.88);
  });

  it("extra tid den dagen räknas som arbetad tid: 5 tim maskin + 1 tim planering + hemskickad → 2 tim hemskickad", () => {
    const u = kor([dag("2026-09-07", 300)], [hem("2026-09-07")], [{ datum: "2026-09-07", minuter: 60 }]);
    expect(u.hemskickad[0]).toMatchObject({ arbetad_min: 360, minuter: 120 });
    expect(u.timlon_h).toBe(8);
    expect(u.overtid_h).toBe(0);
  });
});

describe("hemskickad: aldrig övertid, räknas mot månadens ordinarie", () => {
  it("en dag med minst 8 tim arbete har inget att fyllas upp: raden gör ingenting", () => {
    for (const min of [480, 540, 600]) {
      const u = kor([dag("2026-09-07", min)], [hem("2026-09-07", "16:00")]);
      expect(u.hemskickad, `${min} min`).toEqual([]);
      expect(u.hemskickad_h).toBe(0);
      expect(u.timlon_h).toBe(8);
      expect(u.overtid_h).toBe(Math.round((min - 480) / 60 * 100) / 100);
    }
  });

  it("den hemskickade dagen är en hel 8-timmarsdag UTANFÖR månadens utjämning: den ger aldrig övertid själv och tar inte bort andras", () => {
    // Dag A 10 tim (2 tim över 8), dag B 6 tim + hemskickad. Utan hemskickad jämnas A:s extra tid ut mot B:s korta dag: 16 tim arbete mot
    // 16 ordinarie → ingen övertid. Med hemskickad är B en full dag (8) och A:s två timmar är övertid — det är arbete över 8 tim på en dag.
    const utan = kor([dag("2026-09-07", 600), dag("2026-09-08", 360)]);
    expect(utan.timlon_h).toBe(16);
    expect(utan.overtid_h).toBe(0);
    const med = kor([dag("2026-09-07", 600), dag("2026-09-08", 360)], [hem("2026-09-08")]);
    expect(med.timlon_h).toBe(16);
    expect(med.overtid_h).toBe(2);
    expect(med.hemskickad_h).toBe(2);
  });

  it("flera hemskickade dagar: timlön = ordinarie (antal arbetsdagar × 8), övertid 0", () => {
    const u = kor([dag("2026-09-07", 240), dag("2026-09-08", 300), dag("2026-09-09", 480)], [hem("2026-09-07", "12:00"), hem("2026-09-08", "13:00")]);
    expect(u.timlon_h).toBe(24);
    expect(u.overtid_h).toBe(0);
    expect(u.hemskickad.map(h => h.minuter)).toEqual([240, 180]);
    expect(u.hemskickad_h).toBe(7);
  });

  it("två rader samma dag räknas EN gång (ingen dubbelbetalning)", () => {
    const u = kor([dag("2026-09-07", 360)], [hem("2026-09-07", "14:00"), hem("2026-09-07", "14:05")]);
    expect(u.hemskickad).toHaveLength(1);
    expect(u.timlon_h).toBe(8);
  });

  it("fylls upp till 8 tim även om ordinarie veckotid är en annan: målet är 8 tim per dag, som ordinarie", () => {
    const u = kor([dag("2026-09-07", 360)], [hem("2026-09-07")], [], { ordinarieVeckaH: 37.5 });
    expect(u.hemskickad[0].minuter).toBe(120);
    expect(u.timlon_h).toBe(8);
  });
});

describe("hemskickad på en dag som inte är en arbetsdag", () => {
  it("under 60 minuters arbete (kortpass): hela dagen betalas som timlön, men dagen ger ingen ×8, vältlapp eller reseersättning", () => {
    const u = kor([dag("2026-09-07", 30)], [hem("2026-09-07", "07:30")]);
    expect(u.hemskickad[0].minuter).toBe(450);
    expect(u.timlon_h).toBe(8);
    expect(u.overtid_h).toBe(0);
    expect(u.arbetsdagar).toBe(0);
    expect(u.valtlappar_veckor).toBe(0);
  });

  it("ingen arbetsrad alls (hemskickad vid ankomst): 8 tim timlön, ingen arbetsdag", () => {
    const u = kor([], [hem("2026-09-07", "07:00")]);
    expect(u.hemskickad[0]).toMatchObject({ arbetad_min: 0, minuter: HEM_DAG_MIN });
    expect(u.timlon_h).toBe(8);
    expect(u.arbetsdagar).toBe(0);
    expect(u.overtid_h).toBe(0);
  });
});

describe("hemskickad är ingen frånvaro", () => {
  it("syns varken som deldag, frånvarorad eller varning om löneart som saknas — men en riktig deldag (sjuk) gör det fortfarande", () => {
    const u = kor([dag("2026-09-07", 360), dag("2026-09-08", 300)], [hem("2026-09-07"), sjuk("2026-09-08")]);
    expect(u.deldagar.map(d => d.typ)).toEqual(["sjuk"]);
    expect(u.franvaro).toEqual([]);
    expect(u.varningar.some(v => /Deldag \(hemskickad\)/.test(v))).toBe(false);
    expect(u.varningar.some(v => /Deldag \(sjuk\)/.test(v))).toBe(true);
    // Sjukdagen fylls INTE upp: den är frånvaro utan lön tills löneart är fastställd.
    expect(u.timlon_h).toBe(8 + 5);
  });

  it("en hemskickad rad utan klockslag (felaktig data) blir aldrig frånvaro eller löneart som saknas: den gör ingenting", () => {
    const u = kor([dag("2026-09-07", 360)], [{ typ: "hemskickad", startdatum: "2026-09-07", slutdatum: "2026-09-09", fran_tid: null, till_tid: null }]);
    expect(u.franvaro).toEqual([]);
    expect(u.hemskickad).toEqual([]);
    expect(u.varningar.some(v => /Frånvaro \(hemskickad\)/.test(v))).toBe(false);
    expect(u.timlon_h).toBe(6);
  });

  it("en hemskickad rad utanför arbetsmånaden räknas inte", () => {
    const u = kor([dag("2026-09-07", 360)], [hem("2026-08-31"), hem("2026-10-01")]);
    expect(u.hemskickad).toEqual([]);
    expect(u.timlon_h).toBe(6);
  });
});

describe("hemskickad: företagsledare och oförändrade månader", () => {
  it("företagsledare får inga lönerader alls — hemskickad ändrar inget där", () => {
    const u = kor([dag("2026-09-07", 360)], [hem("2026-09-07")], [], { foretagsledare: true });
    expect(u.rader).toEqual([]);
    expect(u.timlon_h).toBe(0);
  });

  it("en månad UTAN hemskickad är oförändrad: timlönens beskrivning nämner inget om hemskickad", () => {
    const u = kor([dag("2026-09-07", 480), dag("2026-09-08", 480)]);
    const tim = u.rader.find(r => r.loneart === "timlon")!;
    expect(tim.beskrivning).toBe("Timlön: 16h ordinarie (2 dagar × 8h)");
    expect(u.hemskickad).toEqual([]);
  });

  it("en månad MED hemskickad säger det i timlönens beskrivning (så det syns i Fortnox)", () => {
    const u = kor([dag("2026-09-07", 360)], [hem("2026-09-07")]);
    expect(u.rader.find(r => r.loneart === "timlon")!.beskrivning).toBe("Timlön: 8h ordinarie (1 dagar × 8h) varav 2h hemskickad");
  });
});

describe("lib/franvaro: hemskickad är en deldag-typ som anmäls och fylls upp till 8 tim", () => {
  it("minuter = 8 tim − arbetade, aldrig negativt, aldrig över 8 tim", () => {
    expect(hemskickadMinuter(360)).toBe(120);
    expect(hemskickadMinuter(0)).toBe(480);
    expect(hemskickadMinuter(480)).toBe(0);
    expect(hemskickadMinuter(700)).toBe(0);
    expect(hemskickadMinuter(null)).toBe(480);
    expect(hemskickadMinuter(-30)).toBe(480);
  });
  it("visas som tim:min", () => {
    expect(fmtTimMin(120)).toBe("2:00");
    expect(fmtTimMin(113)).toBe("1:53");
    expect(fmtTimMin(450)).toBe("7:30");
    expect(fmtTimMin(0)).toBe("0:00");
  });
});

describe("registreraFranvaro: hemskickad skrivs som en deldag med klockslag, aldrig som hel dag eller intervall", () => {
  const sb = (log: any[]) => ({ from: () => ({ insert: (rad: any) => { log.push(rad); return { select: () => ({ single: async () => ({ data: { id: "x", ...rad }, error: null }) }) }; } }) });
  const p = { medarbetareId: "m-1", namn: "Anna", datum: "2026-09-07", typ: "hemskickad" as const };
  it("med klockslag: rad med typ hemskickad, registrerad, från-tid och ingen till-tid", async () => {
    const log: any[] = [];
    const r = await registreraFranvaro(sb(log), { ...p, franTid: "14:00" });
    expect(r.ok).toBe(true);
    expect(log[0]).toMatchObject({ typ: "hemskickad", status: "registrerad", kalla: "morgonkort", startdatum: "2026-09-07", slutdatum: "2026-09-07", fran_tid: "14:00", till_tid: null });
  });
  it("utan klockslag (hel dag): vägras, ingenting skrivs", async () => {
    const log: any[] = [];
    const r = await registreraFranvaro(sb(log), p);
    expect(r).toEqual({ ok: false, fel: "Hemskickad gäller resten av dagen — ange klockslaget du åkte hem." });
    expect(log).toEqual([]);
  });
  it("med sluttid: vägras (resten av dagen betalas upp till 8 tim)", async () => {
    const log: any[] = [];
    const r = await registreraFranvaro(sb(log), { ...p, franTid: "14:00", tillTid: "15:00" });
    expect(r.ok).toBe(false);
    expect(log).toEqual([]);
  });
});
