/**
 * oversikt.ts — apteringens översikt och listan "Alla objekt", som ren logik.
 *
 * Valutan är m³ UTANFÖR BESTÄLLT på maskinens egna kap: volymen maskinen kapade
 * som inte hamnade i beställd klass (utanforM3 i vymodellen). Procent står bredvid.
 * Förarens kortningar vid fel på trädet är rätt aptering och räknas inte —
 * därför aldrig ordet "fel virke" (Martin 2026-10-21).
 *
 * Regler (Martin 2026-10-21, "som Apple hade gjort"):
 *  - Översikten = ett tal (senaste månadens utanför beställt), staplar per månad, högst
 *    EN höjdpunkt, och vägen till listan. Höjdpunkten visas bara när den är sann.
 *  - Månad = sista filens månad (svensk tid), alltså när kapningen skedde — inte
 *    när någon markerade objektet avslutat (Brokamåla: fil juli, avslutad oktober).
 *  - Små objekt (< SMA_M3 bedömd volym) bedöms inte: de samlas på en rad per månad.
 *  - "Högt" i ord när andelen är ≥ HOGT_PCT; färg förstärker bara.
 *  - Summan är summan av det som visas: varje objekts m³ rundas först.
 */
import type { ObjektKort, VantandeObjekt } from "./types";

/** Under så här mycket bedömd volym är andelen utanför beställt brus (gallringar med 0–2 m³ timmer). */
export const SMA_M3 = 30;
/** Utanför beställt i procent som märks "högt". Normalt ligger runt 15–16 % (aug–okt 2026). */
export const HOGT_PCT = 20;
/** Aktivt objekt utan ny fil på så här många dagar räknas inte som pågående. */
export const TYST_DAGAR = 14;
/** Skillnad i procentenheter som räknas som en förändring i höjdpunkten. */
const FORANDRING_PP = 2;
/** Antal månader i staplarna. */
export const STAPLAR = 12;

const MANADSNAMN = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** "2026-10" ur en tidpunkt, i svensk tid. null om tiden saknas. */
export function manadFor(tid: string | null | undefined): string | null {
  if (!tid) return null;
  const d = new Date(tid);
  if (Number.isNaN(d.getTime())) return null;
  const delar = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit" }).formatToParts(d);
  const ar = delar.find((x) => x.type === "year")?.value;
  const man = delar.find((x) => x.type === "month")?.value;
  return ar && man ? `${ar}-${man}` : null;
}

/** "oktober" (samma år som `nu`) eller "oktober 2025". */
export function manadNamn(manad: string, nuManad?: string | null): string {
  const [ar, m] = manad.split("-");
  const namn = MANADSNAMN[Number(m) - 1] ?? manad;
  return nuManad && nuManad.slice(0, 4) !== ar ? `${namn} ${ar}` : namn;
}

/** Kort månadsetikett under en stapel: "okt". */
export function manadKort(manad: string): string {
  return manadNamn(manad).slice(0, 3);
}

function forraManad(manad: string): string {
  const [ar, m] = manad.split("-").map(Number);
  return m === 1 ? `${ar - 1}-12` : `${ar}-${String(m - 1).padStart(2, "0")}`;
}

const pct = (fel: number, vol: number) => (vol > 0 ? Math.round((100 * fel) / vol) : null);

export interface ObjektRad {
  objectKey: string;
  namn: string;
  volymM3: number; // traktens volym (alla kap), rundad, hela m³
  bedomdM3: number; // maskinens egna kap som talet räknas mot, rundad
  utanforM3: number | null; // rundad, hela m³
  pct: number | null;
  hogt: boolean;
}

export interface Manad {
  manad: string;
  utanforM3: number; // summan av radernas rundade utanför
  volymM3: number; // summan av radernas rundade bedömda volym (maskinens kap)
  pct: number | null;
}

function tillRad(k: ObjektKort): ObjektRad {
  const bedomd = Math.round(k.bedomdM3 ?? k.volymM3);
  const ut = k.utanforM3 == null ? null : Math.round(k.utanforM3);
  const p = ut == null ? null : pct(ut, bedomd);
  return {
    objectKey: k.objectKey,
    namn: k.objektNamn ?? "Okänt objekt",
    volymM3: Math.round(k.volymM3),
    bedomdM3: bedomd,
    utanforM3: ut,
    pct: p,
    hogt: p != null && p >= HOGT_PCT && bedomd >= SMA_M3,
  };
}

/** Pågår = aktivt och fil inom TYST_DAGAR. Tyst = aktivt men ingen fil på länge. Resten är klart. */
function slag(k: ObjektKort): "pagar" | "tyst" | "klar" {
  if (k.status !== "active") return "klar";
  return (k.dagarSedanFil ?? 0) >= TYST_DAGAR ? "tyst" : "pagar";
}

/** Månadssummor över avslutade objekt med ett bedömt tal, nyast först. */
export function manader(kort: ObjektKort[]): Manad[] {
  const per = new Map<string, { fel: number; vol: number }>();
  for (const k of kort) {
    if (slag(k) !== "klar") continue;
    const m = manadFor(k.lastFileAt);
    const r = tillRad(k);
    if (!m || r.utanforM3 == null) continue;
    const s = per.get(m) ?? { fel: 0, vol: 0 };
    s.fel += r.utanforM3;
    s.vol += r.bedomdM3;
    per.set(m, s);
  }
  return [...per.entries()]
    .map(([manad, s]) => ({ manad, utanforM3: s.fel, volymM3: s.vol, pct: pct(s.fel, s.vol) }))
    .sort((a, b) => b.manad.localeCompare(a.manad));
}

export interface Hojdpunkt {
  riktning: "battre" | "samre";
  mening: string;
  under: string;
}

export interface Oversikt {
  senaste: Manad | null;
  /** STAPLAR månader bakåt från senaste, äldst först; pct null = ingen avslutad trakt den månaden. */
  staplar: { manad: string; pct: number | null }[];
  hojdpunkt: Hojdpunkt | null;
}

/**
 * Höjdpunkten: senaste månaden mot de (högst) två föregående månaderna MED data.
 * Bättre än alla med minst FORANDRING_PP → "Ni kapar rätt oftare …"; sämre → "Mer utanför beställt …".
 * Annars ingen höjdpunkt — hellre tyst än en mening som inte säger något.
 */
function hojdpunkt(m: Manad[], nuManad: string | null): Hojdpunkt | null {
  const [cur, ...forr] = m;
  if (!cur || cur.pct == null) return null;
  const jamfor = forr.filter((x) => x.pct != null).slice(0, 2);
  if (!jamfor.length) return null;
  const p = jamfor.map((x) => x.pct!);
  const namn = jamfor.map((x) => manadNamn(x.manad, nuManad));
  const mot = namn.length === 2 ? `${namn[1]} och ${namn[0]}` : namn[0];
  const lo = Math.min(...p), hi = Math.max(...p);
  const spann = lo === hi ? `${lo} %` : `${lo}–${hi} %`;
  const curNamn = manadNamn(cur.manad, nuManad);
  if (cur.pct <= lo - FORANDRING_PP) {
    return { riktning: "battre", mening: `Ni kapar rätt oftare i ${curNamn} än i ${mot}.`, under: `${cur.pct} % utanför mot ${spann}` };
  }
  if (cur.pct >= hi + FORANDRING_PP) {
    return { riktning: "samre", mening: `Mer utanför beställt i ${curNamn} än i ${mot}.`, under: `${cur.pct} % utanför mot ${spann}` };
  }
  return null;
}

export function byggOversikt(kort: ObjektKort[], nu: Date): Oversikt {
  const m = manader(kort);
  const senaste = m[0] ?? null;
  const staplar: Oversikt["staplar"] = [];
  if (senaste) {
    const perManad = new Map(m.map((x) => [x.manad, x.pct]));
    let man = senaste.manad;
    for (let i = 0; i < STAPLAR; i++) {
      staplar.unshift({ manad: man, pct: perManad.get(man) ?? null });
      man = forraManad(man);
    }
    // Börja vid första månaden med data — inga tomma staplar före allt.
    while (staplar.length && staplar[0].pct == null) staplar.shift();
  }
  return { senaste, staplar, hojdpunkt: hojdpunkt(m, manadFor(nu.toISOString())) };
}

export interface ListManad extends Manad {
  rader: ObjektRad[];
  sma: ObjektRad[];
}

export interface Lista {
  pagar: ObjektRad[];
  tysta: (ObjektRad & { dagarSedanFil: number })[];
  manader: ListManad[];
}

/** Listan "Alla objekt". `sok` filtrerar på namn (utan hänsyn till versaler). */
export function byggAllaObjekt(kort: ObjektKort[], sok = ""): Lista {
  const q = sok.trim().toLocaleLowerCase("sv-SE");
  const traff = (k: ObjektKort) => !q || (k.objektNamn ?? "").toLocaleLowerCase("sv-SE").includes(q);
  const nyast = (a: ObjektKort, b: ObjektKort) => (b.lastFileAt ?? "").localeCompare(a.lastFileAt ?? "");
  const valda = kort.filter(traff).sort(nyast);

  const pagar = valda.filter((k) => slag(k) === "pagar").map(tillRad);
  const tysta = valda.filter((k) => slag(k) === "tyst").map((k) => ({ ...tillRad(k), dagarSedanFil: k.dagarSedanFil ?? 0 }));

  const summa = new Map(manader(kort).map((x) => [x.manad, x])); // månadens tal gäller hela månaden, även vid sök
  const per = new Map<string, ListManad>();
  for (const k of valda) {
    if (slag(k) !== "klar") continue;
    const m = manadFor(k.lastFileAt);
    if (!m) continue;
    const r = tillRad(k);
    const s = summa.get(m);
    const lm = per.get(m) ?? { manad: m, utanforM3: s?.utanforM3 ?? 0, volymM3: s?.volymM3 ?? 0, pct: s?.pct ?? null, rader: [], sma: [] };
    (r.utanforM3 == null || r.bedomdM3 < SMA_M3 ? lm.sma : lm.rader).push(r);
    per.set(m, lm);
  }
  return { pagar, tysta, manader: [...per.values()].sort((a, b) => b.manad.localeCompare(a.manad)) };
}

/** "6 små trakter" / "1 liten trakt". */
export function smaText(n: number): string {
  return n === 1 ? "1 liten trakt" : `${n} små trakter`;
}

/** "1 146" — hela m³ med svenskt tusentalsavstånd. */
export function m3(n: number): string {
  return `${Math.round(n).toLocaleString("sv-SE")} m³`;
}

export type { VantandeObjekt };
