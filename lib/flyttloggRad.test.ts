/**
 * Lastbilsflytt ger förarens flyttrad (beslut Martin 2026-10-19).
 *
 * Flyttloggen (maskin_flytt) säger när lastbilen hämtade maskinen (hamtad_tid) och lämnade den (sluttid). Raden skapas hos den
 * förare som hade maskinen den dagen, märkt "Från flyttloggen", med tid lastning → avlastning. Ingen rad om flytten startar
 * efter ordinarie arbetstid (avtalet: senast 17:00), på helg eller röd dag. Samma regler som GPS-raden: bara obekräftade dagar,
 * inom förarens pass (märkt tid, redan betald), ingen dubbelräkning mot GPS-raden.
 *
 * Facit ur produktion (bara SELECT, 2026-10-19). Alla 19 lastbilsflyttar sedan 14 juli ligger inom maskinförarens pass:
 *   2026-10-05 A130743   07:15–09:14  Daniel 06:40–16:00      2026-09-16 R64428  14:19–14:58  Oskar 07:38–16:56
 *   2026-10-06 PONS      17:12–18:27  Stefan 06:12–18:30      (lastning efter 17:00 → ingen rad)
 *   2026-08-10 PONS      16:21–16:56  Stefan 05:45–16:30 + Joacim 06:43–07:12  (klipps till 16:21–16:30, hos Stefan)
 */
import { describe, it, expect } from "vitest";
import {
  ORDINARIE_SLUT, arOrdinarieDag, lokalSthlm, planeraFlyttloggsRader, arFlyttloggsRad,
  type LogFlytt, type MaskinDag,
} from "./flyttloggRad";

const MASKIN = "A130743";
const DANIEL = "med-daniel", STEFAN = "med-stefan", JOACIM = "med-joacim";
/** Svensk sommartid (UTC+2): 07:15 lokal = 05:15Z. */
const utc = (datum: string, hhmm: string, offset = 2) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${datum}T00:00:00Z`); d.setUTCHours(h - offset, m);
  return d.toISOString();
};
const flytt = (o: Partial<LogFlytt> & { datum?: string; h?: string; s?: string } = {}): LogFlytt => {
  const datum = o.datum ?? "2026-10-05";
  return {
    id: "f-1", maskin_id: MASKIN, avbruten: false, flytt_km: 36,
    hamtad_tid: utc(datum, o.h ?? "07:15"), sluttid: utc(datum, o.s ?? "09:14"),
    fran_objekt_id: "obj-a", till_objekt_id: "obj-b", fran_plats_id: null, till_plats_id: null, ...o,
  };
};
const dag = (o: Partial<MaskinDag> = {}): MaskinDag => ({
  medarbetare_id: DANIEL, datum: "2026-10-05", maskin_id: MASKIN, start_tid: "06:40:00", slut_tid: "16:00:00", skyddad: false, ...o,
});
const NAMN = { objekt: { "obj-a": "Älmehult", "obj-b": "Trestensdal" } as Record<string, string>, plats: {} as Record<string, string> };
const plan = (flyttar: LogFlytt[], dagar: MaskinDag[] = [dag()], extra: Partial<Parameters<typeof planeraFlyttloggsRader>[0]> = {}) =>
  planeraFlyttloggsRader({ flyttar, dagar, upptagna: [], borta: [], namn: NAMN, ...extra });

describe("tid och dag", () => {
  it("lokalSthlm: sommartid och vintertid (07:15 lokal i oktober = 05:15Z, i januari = 06:15Z)", () => {
    expect(lokalSthlm("2026-10-05T05:15:00+00:00")).toEqual({ datum: "2026-10-05", sek: 7 * 3600 + 15 * 60 });
    expect(lokalSthlm("2026-01-12T06:15:00Z")).toEqual({ datum: "2026-01-12", sek: 7 * 3600 + 15 * 60 });
    expect(lokalSthlm("2026-10-05T22:30:00Z")).toEqual({ datum: "2026-10-06", sek: 30 * 60 }); // lokal dag byter vid midnatt
    expect(lokalSthlm(null)).toBeNull();
    expect(lokalSthlm("skräp")).toBeNull();
  });
  it("ordinarie dag = måndag–fredag som inte är röd dag eller helgafton", () => {
    expect(arOrdinarieDag("2026-10-05")).toBe(true);   // måndag
    expect(arOrdinarieDag("2026-10-09")).toBe(true);   // fredag
    expect(arOrdinarieDag("2026-10-10")).toBe(false);  // lördag
    expect(arOrdinarieDag("2026-10-11")).toBe(false);  // söndag
    expect(arOrdinarieDag("2026-12-24")).toBe(false);  // julafton (torsdag)
    expect(arOrdinarieDag("2026-12-25")).toBe(false);  // juldagen
    expect(arOrdinarieDag("2026-06-19")).toBe(false);  // midsommarafton (fredag)
    expect(arOrdinarieDag("2026-12-23")).toBe(true);
  });
  it("ordinarie arbetstid slutar 17:00 (Skogsavtalet §5 mom 3: 'senast kl. 17.00')", () => { expect(ORDINARIE_SLUT).toBe("17:00"); });
});

describe("raden: tid, innehåll, märkning", () => {
  it("2026-10-05 A130743 07:15–09:14 hos Daniel: en rad, tid lastning → avlastning, märkt flyttlogg, med flyttens id", () => {
    const r = plan([flytt()]);
    expect(r.skapa).toHaveLength(1);
    expect(r.skapa[0]).toMatchObject({
      medarbetare_id: DANIEL, datum: "2026-10-05", start_tid: "07:15:00", slut_tid: "09:14:00",
      aktivitet_typ: "flytt", debiterbar: false, objekt_id: null, kalla: "flyttlogg", flytt_id: "f-1",
    });
    expect(r.ersatt).toEqual([]);
  });
  it("trakterna och km står på raden: 'Älmehult → Trestensdal · 36 km' (hela km ur flyttloggen)", () => {
    expect(plan([flytt()]).skapa[0].kommentar).toBe("Älmehult → Trestensdal · 36 km");
  });
  it("plats i stället för objekt, och okänd trakt: aldrig ett id", () => {
    const f = flytt({ fran_objekt_id: null, fran_plats_id: "p-1", till_objekt_id: null, till_plats_id: null });
    const r = plan([f], [dag()], { namn: { objekt: {}, plats: { "p-1": "Verkstan" } } });
    expect(r.skapa[0].kommentar).toBe("Verkstan → Okänd plats · 36 km");
  });
  it("saknat km utelämnas ('Älmehult → Trestensdal')", () => {
    expect(plan([flytt({ flytt_km: null })]).skapa[0].kommentar).toBe("Älmehult → Trestensdal");
  });
  it("km kan komma som text ur databasen (numeric): '53'", () => {
    expect(plan([flytt({ flytt_km: "53" as any })]).skapa[0].kommentar).toBe("Älmehult → Trestensdal · 53 km");
  });
  it("märkningen: bara kalla 'flyttlogg' är en rad från flyttloggen", () => {
    expect(arFlyttloggsRad({ kalla: "flyttlogg" })).toBe(true);
    expect(arFlyttloggsRad({ kalla: "flytt" })).toBe(false);
    expect(arFlyttloggsRad({ kalla: "forare" })).toBe(false);
    expect(arFlyttloggsRad(null)).toBe(false);
  });
});

describe("vilka flyttar som INTE ger en rad", () => {
  it("flytt av extern maskin (maskin_id saknas) får ingen rad ens när en dag saknar maskin (null ≠ null)", () => {
    expect(plan([flytt({ maskin_id: null })], [dag({ maskin_id: null })]).skapa).toHaveLength(0);
  });
  it("avbruten flytt", () => { expect(plan([flytt({ avbruten: true })]).skapa).toHaveLength(0); });
  it("lastning eller avlastning saknas (aldrig en gissad tid)", () => {
    expect(plan([flytt({ hamtad_tid: null })]).skapa).toHaveLength(0);
    expect(plan([flytt({ sluttid: null })]).skapa).toHaveLength(0);
  });
  it("avlastning före lastning eller lika (trasig logg)", () => {
    expect(plan([flytt({ h: "09:00", s: "08:00" })]).skapa).toHaveLength(0);
    expect(plan([flytt({ h: "09:00", s: "09:00" })]).skapa).toHaveLength(0);
  });
  it("extern maskin (ingen egen maskin)", () => { expect(plan([flytt({ maskin_id: null })]).skapa).toHaveLength(0); });
  it("startar efter ordinarie arbetstid: lastning 17:12 (2026-10-06, Stefan 06:12–18:30) ger ingen rad", () => {
    const r = plan([flytt({ datum: "2026-10-06", h: "17:12", s: "18:27" })], [dag({ medarbetare_id: STEFAN, datum: "2026-10-06", start_tid: "06:12:00", slut_tid: "18:30:00" })]);
    expect(r.skapa).toHaveLength(0);
  });
  it("gränsen: lastning 16:59 ger rad, 17:00 ger ingen", () => {
    const d = dag({ start_tid: "06:00:00", slut_tid: "18:30:00" });
    expect(plan([flytt({ h: "16:59", s: "17:40" })], [d]).skapa).toHaveLength(1);
    expect(plan([flytt({ h: "17:00", s: "17:40" })], [d]).skapa).toHaveLength(0);
  });
  it("lördag och söndag (då flyttar Martin/Joacim själva)", () => {
    for (const datum of ["2026-10-10", "2026-10-11"]) {
      expect(plan([flytt({ datum })], [dag({ datum })]).skapa).toHaveLength(0);
    }
  });
  it("röd dag: juldagen 2026 (fredag) och julafton", () => {
    for (const datum of ["2026-12-25", "2026-12-24"]) {
      expect(plan([flytt({ datum })], [dag({ datum })]).skapa).toHaveLength(0);
    }
  });
  it("vardag före 06:30 räknas fortfarande (bara SLUTET på ordinarie tid är beslutat): 05:50 → 07:10", () => {
    const d = dag({ datum: "2026-08-13", medarbetare_id: STEFAN, start_tid: "03:00:00", slut_tid: "13:10:00" });
    expect(plan([flytt({ datum: "2026-08-13", h: "05:50", s: "07:10" })], [d]).skapa).toHaveLength(1);
  });
});

describe("vilken förare hade maskinen", () => {
  it("den förare som hade maskinen den dagen — inte någon annans dag eller maskin", () => {
    const dagar = [
      dag(),
      dag({ medarbetare_id: "med-annan", maskin_id: "A030353" }),
      dag({ medarbetare_id: "med-igar", datum: "2026-10-04" }),
    ];
    expect(plan([flytt()], dagar).skapa.map(r => r.medarbetare_id)).toEqual([DANIEL]);
  });
  it("ingen förare hade maskinen den dagen (maskinen stod, ingen arbetsdag): ingen rad", () => {
    expect(plan([flytt()], []).skapa).toHaveLength(0);
    expect(plan([flytt()], [dag({ maskin_id: "A030353" })]).skapa).toHaveLength(0);
  });
  it("två förare på maskinen: den vars pass täcker mest av flytten. 2026-08-10 16:21–16:56: Stefan (till 16:30) före Joacim (07:12)", () => {
    const dagar = [
      dag({ medarbetare_id: STEFAN, datum: "2026-08-10", start_tid: "05:45:00", slut_tid: "16:30:00" }),
      dag({ medarbetare_id: JOACIM, datum: "2026-08-10", start_tid: "06:43:00", slut_tid: "07:12:00" }),
    ];
    const r = plan([flytt({ datum: "2026-08-10", h: "16:21", s: "16:56" })], dagar);
    expect(r.skapa).toHaveLength(1);
    expect(r.skapa[0]).toMatchObject({ medarbetare_id: STEFAN, start_tid: "16:21:00", slut_tid: "16:30:00" });
  });
  it("lika mycket överlapp hos två förare är tvetydigt: ingen rad (hellre ingen än fel förare)", () => {
    const dagar = [
      dag({ medarbetare_id: STEFAN, start_tid: "06:00:00", slut_tid: "08:00:00" }),
      dag({ medarbetare_id: JOACIM, start_tid: "08:00:00", slut_tid: "10:00:00" }),
    ];
    expect(plan([flytt({ h: "07:30", s: "08:30" })], dagar).skapa).toHaveLength(0);
  });
  it("flytten ligger helt utanför förarens pass (maskinen var inte inloggad): ingen rad — okänd arbetstid läggs aldrig till", () => {
    expect(plan([flytt({ h: "05:00", s: "06:00" })], [dag()]).skapa).toHaveLength(0);
    expect(plan([flytt({ h: "16:10", s: "16:50" })], [dag()]).skapa).toHaveLength(0);
  });
  it("BEKRÄFTAD dag (förarens underskrift) rörs aldrig — och raden går inte heller till en annan förare", () => {
    const dagar = [
      dag({ skyddad: true }),
      dag({ medarbetare_id: "med-annan", start_tid: "06:00:00", slut_tid: "07:20:00" }),
    ];
    expect(plan([flytt()], dagar).skapa).toHaveLength(0);
  });
});

describe("kantfall i tid", () => {
  it("ett överlapp med förarens pass på under en minut ger ingen rad (15:59:30 mot passets slut 16:00)", () => {
    const f = flytt();
    f.hamtad_tid = "2026-10-05T13:59:30Z"; f.sluttid = "2026-10-05T14:40:00Z"; // 15:59:30–16:40 lokal
    expect(plan([f]).skapa).toHaveLength(0);
  });
  it("avlastning efter midnatt räknas som dagens slut: 16:00 → 00:30 nästa dag mot pass till 23:30 blir 16:00–23:30", () => {
    const f = flytt();
    f.hamtad_tid = "2026-10-05T14:00:00Z"; f.sluttid = "2026-10-05T22:30:00Z"; // 16:00 → 00:30 (6 okt) lokal
    const r = plan([f], [dag({ start_tid: "06:00:00", slut_tid: "23:30:00" })]);
    expect(r.skapa).toHaveLength(1);
    expect([r.skapa[0].start_tid, r.skapa[0].slut_tid]).toEqual(["16:00:00", "23:30:00"]);
  });
});

describe("inom förarens pass (märkt tid, redan betald — lönen oförändrad)", () => {
  it("klipps mot passets slut: 15:30–16:30 mot slut 16:00 blir 15:30–16:00", () => {
    const r = plan([flytt({ h: "15:30", s: "16:30" })]);
    expect([r.skapa[0].start_tid, r.skapa[0].slut_tid]).toEqual(["15:30:00", "16:00:00"]);
  });
  it("klipps mot passets start: 06:00–07:00 mot start 06:40 blir 06:40–07:00", () => {
    const r = plan([flytt({ h: "06:00", s: "07:00" })]);
    expect([r.skapa[0].start_tid, r.skapa[0].slut_tid]).toEqual(["06:40:00", "07:00:00"]);
  });
  it("tider avrundas nedåt till hela minuter", () => {
    const f = flytt();
    f.hamtad_tid = "2026-10-05T05:15:42Z"; f.sluttid = "2026-10-05T07:14:59Z";
    const r = plan([f]);
    expect([r.skapa[0].start_tid, r.skapa[0].slut_tid]).toEqual(["07:15:00", "09:14:00"]);
  });
  it("en rad blir aldrig längre än passet och aldrig utanför det", () => {
    const r = plan([flytt({ h: "05:00", s: "20:00" })]);
    expect([r.skapa[0].start_tid, r.skapa[0].slut_tid]).toEqual(["06:40:00", "16:00:00"]);
  });
  it("en dag utan klockslag på passet (skalrad) får ingen rad", () => {
    expect(plan([flytt()], [dag({ start_tid: null, slut_tid: null })]).skapa).toHaveLength(0);
  });
});

describe("en gång, aldrig igen efter svep, och aldrig dubbelt mot GPS-raden", () => {
  const upp = (o: any = {}) => ({ id: "s-1", medarbetare_id: DANIEL, datum: "2026-10-05", start_tid: "07:15:00", slut_tid: "09:14:00", kalla: "flyttlogg", flytt_id: "f-1", ...o });
  it("idempotent: finns raden redan (synken kör var 5:e minut) skapas ingen ny", () => {
    expect(plan([flytt()], [dag()], { upptagna: [upp()] }).skapa).toHaveLength(0);
  });
  it("föraren har ändrat tiden på raden: flyttens id känns igen, ingen ny rad bredvid", () => {
    expect(plan([flytt()], [dag()], { upptagna: [upp({ start_tid: "07:30:00", slut_tid: "08:30:00" })] }).skapa).toHaveLength(0);
  });
  it("föraren har ändrat tiden så den inte längre överlappar: flyttens id hindrar ändå en ny rad", () => {
    expect(plan([flytt()], [dag()], { upptagna: [upp({ start_tid: "12:00:00", slut_tid: "12:30:00" })] }).skapa).toHaveLength(0);
  });
  it("svep (gravsten med flyttens id): raden skapas aldrig igen", () => {
    const borta = [{ medarbetare_id: DANIEL, datum: "2026-10-05", flytt_id: "f-1", start_tid: "07:15:00", slut_tid: "09:14:00" }];
    expect(plan([flytt()], [dag()], { borta }).skapa).toHaveLength(0);
  });
  it("svep: flyttens id hindrar när tiden i loggen rättats så att den inte längre överlappar gravstenens tid", () => {
    const borta = [{ medarbetare_id: DANIEL, datum: "2026-10-05", flytt_id: "f-1", start_tid: "07:15:00", slut_tid: "09:14:00" }];
    expect(plan([flytt({ h: "12:00", s: "13:00" })], [dag()], { borta }).skapa).toHaveLength(0);
    // en ANNAN flytt samma dag (annat id, annan tid) hindras inte av den gravstenen
    expect(plan([flytt({ id: "f-2", h: "12:00", s: "13:00" })], [dag()], { borta }).skapa).toHaveLength(1);
  });
  it("en gravsten för en GPS-rad på samma tid (föraren tog bort den) hindrar också flyttloggsraden", () => {
    const borta = [{ medarbetare_id: DANIEL, datum: "2026-10-05", flytt_id: null, start_tid: "07:20:00", slut_tid: "09:00:00" }];
    expect(plan([flytt()], [dag()], { borta }).skapa).toHaveLength(0);
  });
  it("en gravsten på en annan tid samma dag hindrar inte", () => {
    const borta = [{ medarbetare_id: DANIEL, datum: "2026-10-05", flytt_id: null, start_tid: "12:00:00", slut_tid: "13:00:00" }];
    expect(plan([flytt()], [dag()], { borta }).skapa).toHaveLength(1);
  });
  it("GPS-raden finns redan för samma flytt (kalla 'flytt'): flyttloggen ersätter den — EN rad, inte två", () => {
    const gps = { id: "s-gps", medarbetare_id: DANIEL, datum: "2026-10-05", start_tid: "07:25:00", slut_tid: "09:05:00", kalla: "flytt", flytt_id: null };
    const r = plan([flytt()], [dag()], { upptagna: [gps] });
    expect(r.skapa).toHaveLength(1);
    expect(r.ersatt).toEqual(["s-gps"]);
  });
  it("en GPS-rad på en annan tid samma dag rörs inte", () => {
    const gps = { id: "s-gps", medarbetare_id: DANIEL, datum: "2026-10-05", start_tid: "12:00:00", slut_tid: "13:00:00", kalla: "flytt", flytt_id: null };
    const r = plan([flytt()], [dag()], { upptagna: [gps] });
    expect(r.skapa).toHaveLength(1);
    expect(r.ersatt).toEqual([]);
  });
  it("förarens egen period (brandvakt, kalla 'forare') som överlappar: ingen rad och inget ersätts", () => {
    const egen = { id: "s-egen", medarbetare_id: DANIEL, datum: "2026-10-05", start_tid: "08:00:00", slut_tid: "08:30:00", kalla: "forare", flytt_id: null };
    const r = plan([flytt()], [dag()], { upptagna: [egen] });
    expect(r.skapa).toHaveLength(0);
    expect(r.ersatt).toEqual([]);
  });
  it("en annan flyttloggsrad (annan flytt) som överlappar blockerar och ersätts aldrig", () => {
    const annan = upp({ id: "s-2", flytt_id: "f-9", start_tid: "08:00:00", slut_tid: "08:30:00" });
    const r = plan([flytt()], [dag()], { upptagna: [annan] });
    expect(r.skapa).toHaveLength(0);
    expect(r.ersatt).toEqual([]);
  });
  it("en annan förares segment samma dag är inget hinder", () => {
    const annan = { id: "s-x", medarbetare_id: "med-annan", datum: "2026-10-05", start_tid: "07:15:00", slut_tid: "09:14:00", kalla: "forare", flytt_id: null };
    expect(plan([flytt()], [dag()], { upptagna: [annan] }).skapa).toHaveLength(1);
  });
  it("två flyttar samma dag blir två rader i tidsordning; överlappande flyttar ger bara den första", () => {
    const a = flytt({ id: "f-a", h: "11:00", s: "12:00" });
    const b = flytt({ id: "f-b", h: "07:15", s: "08:00" });
    expect(plan([a, b]).skapa.map(r => r.flytt_id)).toEqual(["f-b", "f-a"]);
    const c = flytt({ id: "f-c", h: "07:30", s: "08:30" });
    expect(plan([b, c]).skapa.map(r => r.flytt_id)).toEqual(["f-b"]);
  });
  it("idempotent som helhet: körs planen igen med resultatet som upptaget blir det inget nytt", () => {
    const ett = plan([flytt()]);
    const tva = plan([flytt()], [dag()], { upptagna: ett.skapa.map((r, i) => ({ ...r, id: "s-" + i })) });
    expect(ett.skapa).toHaveLength(1);
    expect(tva.skapa).toHaveLength(0);
  });
});
