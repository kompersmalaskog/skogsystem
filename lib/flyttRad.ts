/**
 * Maskinflytt som egen rad i förarens dag (beslut Martin 2026-10-19).
 *
 * En flytt är en lucka i maskinens GPS-spår mellan två objekt: sista punkten på A, första på B. Raden skapas bara om
 * flytten tar minst 30 min OCH är minst 2 km. Den skrivs som ett SEGMENT (arbetsdag_segment, kalla 'flytt') — tid
 * MÄRKT inom förarens inloggade dag. Den tiden är redan betald (den ligger i arbetad_min), så raden lägger inte till
 * något: lönen läser aldrig segment (vakt: lib/lonesystem/flytt.lon.test.ts). Det är därför "flyttiden är vanlig
 * arbetstid i timlön och övertid" utan någon ny löneart.
 *
 * Allt här är rena funktioner. GPS-luckorna hämtas av SQL-funktionen flytt_luckor (som bara förfiltrerar på tid);
 * REGELN bor här, och konstanterna skickas till SQL:en så att det finns en enda källa.
 *
 * Tider är svensk väggklocka (opti_tid_lokal i SQL). Luckor som korsar midnatt är parkering över natten, aldrig en flytt.
 */

export const FLYTT_MIN_MIN = 30;
export const FLYTT_MIN_KM = 2;

/** En lucka i GPS-spåret, så som SQL-funktionen flytt_luckor returnerar den. */
export type GpsLucka = {
  fran_objekt_id: string | null; till_objekt_id: string | null;
  /** Sista punkten på förra objektet / första på nästa, lokal väggklocka "YYYY-MM-DDTHH:MM:SS[.fff]". */
  start: string; slut: string;
  fran_lat: number; fran_lng: number; till_lat: number; till_lng: number;
};

type Tid = { start_tid: string; slut_tid: string };
export type DagPass = { datum: string; start_tid: string | null; slut_tid: string | null };

export type FlyttSegmentRad = {
  medarbetare_id: string; datum: string; start_tid: string; slut_tid: string;
  aktivitet_typ: "flytt"; debiterbar: false; objekt_id: null; kommentar: string; kalla: "flytt";
};

/** Storcirkelavstånd i km (haversine). */
export function avstandKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Regeln: minst 30 min OCH minst 2 km. Gränsvärdena räknas in. */
export function arFlytt(minuter: number, km: number): boolean {
  return minuter >= FLYTT_MIN_MIN && km >= FLYTT_MIN_KM;
}

const LOKAL_TID = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})/;
const parsaLokal = (t: string): { datum: string; sek: number } | null => {
  const m = LOKAL_TID.exec(t || "");
  return m ? { datum: m[1], sek: (+m[2]) * 3600 + (+m[3]) * 60 + (+m[4]) } : null;
};
/** "HH:MM" eller "HH:MM:SS" → minuter (golv). */
const tMin = (t: string): number => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const tSek = (t: string): number => { const d = (t || "0:0:0").split(":").map(Number); return d[0] * 3600 + (d[1] || 0) * 60 + (d[2] || 0); };
const hhmmss = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
const overlappar = (s: number, e: number, b: { s: number; e: number }) => s < b.e && b.s < e;

/** "6,7 km" under 10 km, annars hela km — en decimal är mer än GPS-luckan kan lova över 10. */
const kmText = (km: number) => (Number.isInteger(km) || km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1).replace(".", ",")} km`);

/** Radens kommentar: trakterna och km. Tiden härleds av raden själv. Okänd trakt = "Okänd plats", aldrig ett id. */
export function flyttKommentar(franNamn: string | null | undefined, tillNamn: string | null | undefined, km: number | null): string {
  const trakter = `${franNamn || "Okänd plats"} → ${tillNamn || "Okänd plats"}`;
  return km == null ? trakter : `${trakter} · ${kmText(km)}`; // flyttloggen kan sakna km: då utelämnas det, det gissas aldrig
}

/**
 * Vilka flyttrader ska skapas för en förares dag? Bara luckor som
 *  - ligger inom EN och samma dag (en lucka över natten är parkering),
 *  - klippt mot förarens pass fortfarande är minst 30 min och minst 2 km,
 *  - inte överlappar något som redan finns (`upptagna`: segment och extra tid) eller som föraren tagit bort (`borta`),
 *  - inte överlappar en tidigare vald flytt samma dag (brus i spåret ger EN rad: den som börjar först).
 * Tiderna golvas till hela minuter på båda ändar, så en rad aldrig blir kortare än 30 min av avrundningen.
 * En dag utan pass (perioddag) får aldrig en flyttrad.
 */
export function planeraFlyttar(i: {
  medarbetareId: string; dag: DagPass; luckor: GpsLucka[]; upptagna: Tid[]; borta: Tid[];
  objektNamn?: Record<string, string>;
}): FlyttSegmentRad[] {
  const { dag } = i;
  if (!dag.start_tid || !dag.slut_tid) return [];
  const passS = tSek(dag.start_tid), passE = tSek(dag.slut_tid);
  if (passE <= passS) return [];

  const kandidater: { s: number; e: number; km: number; fran: string; till: string }[] = [];
  for (const l of i.luckor) {
    if (!l.fran_objekt_id || !l.till_objekt_id || l.fran_objekt_id === l.till_objekt_id) continue;
    const a = parsaLokal(l.start), b = parsaLokal(l.slut);
    if (!a || !b || a.datum !== dag.datum || b.datum !== dag.datum) continue;
    const s = Math.max(a.sek, passS), e = Math.min(b.sek, passE);
    if (e <= s) continue;
    const km = avstandKm(l.fran_lat, l.fran_lng, l.till_lat, l.till_lng);
    if (!arFlytt((e - s) / 60, km)) continue;
    const sMin = Math.floor(s / 60), eMin = Math.floor(e / 60);
    if (eMin <= sMin) continue;
    kandidater.push({ s: sMin, e: eMin, km, fran: l.fran_objekt_id, till: l.till_objekt_id });
  }
  kandidater.sort((x, y) => x.s - y.s || x.e - y.e);

  const spärrar = [...i.upptagna, ...i.borta].map(t => ({ s: tMin(t.start_tid), e: tMin(t.slut_tid) }));
  const valda: FlyttSegmentRad[] = [];
  for (const k of kandidater) {
    if (spärrar.some(b => overlappar(k.s, k.e, b))) continue;
    spärrar.push({ s: k.s, e: k.e }); // nästa kandidat får inte krocka med den här
    valda.push({
      medarbetare_id: i.medarbetareId, datum: dag.datum, start_tid: hhmmss(k.s), slut_tid: hhmmss(k.e),
      aktivitet_typ: "flytt", debiterbar: false, objekt_id: null,
      kommentar: flyttKommentar(i.objektNamn?.[k.fran], i.objektNamn?.[k.till], k.km), kalla: "flytt",
    });
  }
  return valda;
}

/** Är det en rad synken själv skapat — ur GPS-spåret ('flytt') eller flyttloggen ('flyttlogg')? En rad föraren lagt in ('forare') är aldrig det. */
export function arAutomatiskFlytt(rad: { kalla?: string | null } | null | undefined): boolean {
  return rad?.kalla === "flytt" || rad?.kalla === "flyttlogg";
}

/**
 * Gravstenen för en automatisk flytt som föraren tagit bort eller flyttat på: tidsintervallet synken inte får skapa
 * en rad på igen. Null för allt annat.
 */
export function flyttBortaRad(rad: { medarbetare_id: string; datum: string; start_tid: string; slut_tid: string; kalla?: string | null; flytt_id?: string | null } | null | undefined) {
  if (!rad || !arAutomatiskFlytt(rad)) return null;
  const hms = (t: string) => hhmmss(tMin(t));
  const grund = { medarbetare_id: rad.medarbetare_id, datum: rad.datum, start_tid: hms(rad.start_tid), slut_tid: hms(rad.slut_tid) };
  // En rad från flyttloggen kommer ihåg SIN flytt: flyttens id, inte tiden, hindrar att den skapas igen (tiden kan ändras i loggen).
  return rad.kalla === "flyttlogg" ? { ...grund, flytt_id: rad.flytt_id ?? null } : grund;
}
