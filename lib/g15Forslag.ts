// G15-FÖRSLAG för prognosen i "Klar med trakten?" — räknat ur UPPMÄTT utfall, inte ur tidigare planerade timmar.
//
// Underlaget är avslutade trakter av samma typ (slutavverkning/gallring) där både skördad volym och G15 finns i skördar-/maskindatan (`prognos_utfall()`,
// migration 20261017095842). Ur varje trakt räknas prestationen m³fub per G15-timme. G15 = (processing + terräng + övrigt arbete) / 3600, summerad av databasfunktionen.
//
// SKÖRDARE räknas mot trakter med LIKNANDE MEDELSTAM (±25 %, minst 3): medelstam förklarar ca två tredjedelar av variationen i prestation (uppmätt: r² 0,65 slutavverkning,
// 0,72 gallring). Saknas trakter med liknande medelstam finns inget förslag (tomt, orange) — appen gissar inte. Saknas medelstam på DEN HÄR trakten används snitt över alla
// trakter av typen och det SÄGS.
// SKOTARE räknas på trakter som SAMMA SORTS SKOTARE kört (2026-11-17, `skotarKlass`: Wisent, Elephant King …): maskinen förklarar mest av skotarens takt.
// Provet på 27 avslutade slutavverkningar (prod 2026-11-17): snittet över alla maskiner låg 27 % fel (median), per maskin 17 % — Wisent ca 15 m³ per G15-timme,
// Elephant King ca 24 (större lass). Är skotaren okänd, eller har den sorten färre än 3 trakter av typen, gäller snittet över alla trakter av typen som förut.
// Medelstam hjälpte inte skotaren (r² 0,06). Körsträckan hjälper lite till (18 % medelfel mot 25 %, med den FAKTISKT körda sträckan) men är inte med än:
// den måste först kunna räknas ur kartan innan trakten körs.
//
// INTERVALLET ("troligen 38–45") är UPPMÄTT prediktionsfel, inte spridningen bland jämförbara trakter (den ger falsk säkerhet): varje trakt förutsägs med samma metod ur
// de övriga (leave-one-out) och 25:e–75:e percentilen av faktisk/förutsagd prestation sätter intervallet. Färre än 5 sådana fel → inget intervall, och det står.
//
// UTESLUTNING: en trakt vars skördade volym avviker mycket från objektets volym (0,7–1,4 av `objekt.volym`) räknas inte med — då är datan ofullständig (Kroksjömåla:
// 315 av 860 m³, Bågskyttebanan 1 687 av 3 495). Trakter utan känd objektvolym kan inte testas och behålls. G15 under 8 tim räknas inte (för kort för en tillförlitlig kvot).
//
// MEDELSTAM UR LASERSKANNINGEN (2026-11-17): saknar trakten medelstam (Vida fyller sällan i den på gallringar, och när de gör det stämmer den dåligt —
// Santhe 0,13 mot verkliga 0,044) härleds den ur Skogsstyrelsens laserdata: grundytevägd medeldiameter inom traktgränsen (objekt_skogsdata).
// Sambandet diameter → medelstam räknas ur VÅRA EGNA avslutade trakter av samma typ (minst LASER_MIN_PAR, robust linje i log-log, Theil–Sen),
// så det blir bättre av sig självt när fler trakter blir klara. Det är en grov uppskattning (uttaget i en gallring syns inte i lasern) — metoden
// heter 'laser' och intervallet är uppmätt på samma sätt som för övriga: varje trakt förutsägs ur de andra, hela kedjan.
//
// Gamla prognoser (Jockes planerade timmar i manuell_prognos) används inte som underlag.

export const G15_MIN_TRAKTER = 3;
export const G15_MIN_TIM = 8;
export const G15_VOLYMFONSTER = { lag: 0.7, hog: 1.4 } as const;
/** Medelstam ±25 %: förhållandet jämförbar/mål ska ligga mellan 1/1,25 och 1,25. */
export const G15_MEDELSTAMBAND = 1.25;
export const G15_MIN_FEL = 5;
/** Minst så många avslutade trakter av typen med både laserdiameter och uppmätt medelstam, annars ingen laser-medelstam. */
export const LASER_MIN_PAR = 5;

export interface UtfallRad {
  typ: string | null;
  /** objekt.volym (Vidas volym, m³fub) — null = okänd, då kan fullständigheten inte testas */
  volymObjekt: number | null;
  /** skördad volym (m³sub = m³fub) ur skördardatan */
  skordadM3: number | null;
  stammar: number | null;
  skordareG15: number | null;
  skotareG15: number | null;
  /** Sorten skotare som gjorde jobbet (skotarKlass) — null = okänd, eller flera sorter delade på trakten. */
  skotareKlass?: string | null;
  /** objekt.id — för att kunna lägga laserdatan på raden (lib/skogsdata/las). */
  objektId?: string | null;
  /** Laserns grundytevägda medeldiameter inom traktgränsen (cm). */
  laserDiaCm?: number | null;
}

export interface G15Indata {
  typ: string | null;
  volym: number | null;
  medelstam: number | null;
  /** engångstid för basvägsanläggning, läggs på SKOTARENS förslag (som förut) */
  basvagTimmar?: number | null;
  /** Laserns medeldiameter för trakten (cm) — används bara när medelstam saknas. */
  laserDiaCm?: number | null;
  /** Sorten skotare som ska köra trakten (skotarKlass av maskinens modell) — null/utelämnad = okänd, då gäller snittet över alla skotare. */
  skotareKlass?: string | null;
}

export type Metod = 'medelstam' | 'laser' | 'snitt-medelstam-saknas' | 'snitt-typ' | 'maskin';

/** Minsta andel av traktens skotartimmar som en sorts skotare ska ha stått för, för att trakten ska räknas som den sortens. */
export const SKOTARE_MIN_ANDEL = 0.7;

/**
 * Sorten skotare ur maskinens modell: "Elephant King 2026" och "Elephant King AF" är samma sort ("elephant king"), "Wisent2015" är "wisent".
 * Årtal och tillägget AF tas bort; resten jämförs med små bokstäver. Tomt = null.
 */
export function skotarKlass(modell: string | null | undefined): string | null {
  const k = (modell ?? '').toLowerCase().replace(/(19|20)\d{2}(?!\d)/g, ' ').replace(/\baf\b/g, ' ').replace(/\s+/g, ' ').trim();
  return k === '' ? null : k;
}

/** En rad ur RPC:n prognos_utfall_2 (eller den äldre prognos_utfall, utan skotarens maskin) i formen förslaget vill ha. EN mappning för alla läsare. */
export function utfallUrRpc(x: any): UtfallRad {
  const tal = (v: unknown): number | null => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };
  const andel = tal(x?.skotare_andel);
  return {
    typ: x?.typ ?? null, volymObjekt: tal(x?.volym_objekt), skordadM3: tal(x?.skordad_m3), stammar: tal(x?.stammar),
    skordareG15: tal(x?.skordare_g15), skotareG15: tal(x?.skotare_g15),
    skotareKlass: andel != null && andel >= SKOTARE_MIN_ANDEL ? skotarKlass(x?.skotare_modell) : null,
    objektId: x?.objekt_id != null ? String(x.objekt_id) : null,
  };
}

export interface RollForslag {
  /** G15-timmar, avrundat */
  g15: number;
  /** förväntad prestation m³fub/G15 (median bland underlaget) */
  m3PerG15: number;
  /** 25:e–75:e percentilen av uppmätt prediktionsfel, omräknat till G15-timmar. null = för få fel att bedöma. */
  intervall: { lag: number; hog: number } | null;
  /** antal trakter bakom talet */
  antal: number;
  /** medelstam hos de jämförbara (bara metod 'medelstam') */
  medelstamSpann: { lag: number; hog: number } | null;
  /** Sorten skotare förslaget är räknat på (metod 'maskin'). */
  skotareKlass?: string;
  metod: Metod;
  /** Medelstammen härledd ur laserskanningen (bara metod 'laser'). */
  laserMedelstam?: number;
  basvagTim: number;
  typ: string;
}

export type RollResultat =
  | { ok: true; forslag: RollForslag }
  | { ok: false; orsak: 'ingen-volym' | 'typ-saknas' | 'for-fa'; antal: number; text: string };

export interface G15Forslag { skordare: RollResultat; skotare: RollResultat }

export function percentil(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const k = (s.length - 1) * p;
  const f = Math.floor(k), c = Math.min(f + 1, s.length - 1);
  return s[f] + (s[c] - s[f]) * (k - f);
}
const median = (xs: number[]) => percentil(xs, 0.5);

interface Trakt { rate: number; medelstam: number | null; dia: number | null; klass: string | null }

const arPos = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function fullstandig(r: UtfallRad): boolean {
  if (!arPos(r.volymObjekt) || !arPos(r.skordadM3)) return true;   // kan inte testas → behålls
  const k = r.skordadM3 / r.volymObjekt;
  return k >= G15_VOLYMFONSTER.lag && k <= G15_VOLYMFONSTER.hog;
}

/** Trakter av rätt typ med fullständig volym och tillräcklig G15 för rollen. */
function underlag(rader: UtfallRad[], typ: string, roll: 'skordare' | 'skotare'): Trakt[] {
  const ut: Trakt[] = [];
  for (const r of rader) {
    if ((r.typ ?? '').trim().toLowerCase() !== typ) continue;
    if (!fullstandig(r)) continue;
    const g15 = roll === 'skordare' ? r.skordareG15 : r.skotareG15;
    if (!arPos(r.skordadM3) || !arPos(g15) || g15 < G15_MIN_TIM) continue;
    const medelstam = arPos(r.stammar) ? r.skordadM3 / r.stammar : null;
    ut.push({ rate: r.skordadM3 / g15, medelstam, dia: arPos(r.laserDiaCm) ? r.laserDiaCm : null, klass: roll === 'skotare' ? r.skotareKlass ?? null : null });
  }
  return ut;
}

/**
 * Laserdiameter (cm) → medelstam (m³fub/stam), ur par av uppmätta värden. Robust linje i log-log (Theil–Sen: medianen av alla parvisa lutningar),
 * så en udda trakt inte drar med sig sambandet. null = för få par, eller ett samband som inte stiger med grovleken (då är det inget samband).
 */
export function laserModell(par: { dia: number; medelstam: number }[]): ((dia: number) => number) | null {
  if (par.length < LASER_MIN_PAR) return null;
  const p = par.map((x) => ({ x: Math.log(x.dia), y: Math.log(x.medelstam) }));
  const lut: number[] = [];
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i].x !== p[j].x) lut.push((p[j].y - p[i].y) / (p[j].x - p[i].x));
  if (lut.length === 0) return null;
  const b = median(lut);
  if (!(b > 0)) return null;
  const a = median(p.map((q) => q.y - b * q.x));
  return (dia) => Math.exp(a + b * Math.log(dia));
}

/** Paren diameter/medelstam bland avslutade trakter av typen (alla med stammar och laserdata — också de med för lite G15). */
function laserPar(rader: UtfallRad[], typ: string): { dia: number; medelstam: number }[] {
  const ut: { dia: number; medelstam: number }[] = [];
  for (const r of rader) {
    if ((r.typ ?? '').trim().toLowerCase() !== typ) continue;
    if (arPos(r.laserDiaCm) && arPos(r.skordadM3) && arPos(r.stammar)) ut.push({ dia: r.laserDiaCm, medelstam: r.skordadM3 / r.stammar });
  }
  return ut;
}

function jamforbara(alla: Trakt[], medelstam: number): Trakt[] {
  return alla.filter((t) => t.medelstam != null && t.medelstam / medelstam >= 1 / G15_MEDELSTAMBAND && t.medelstam / medelstam <= G15_MEDELSTAMBAND);
}

/** Uppmätt prediktionsfel (faktisk/förutsagd prestation) — varje trakt förutsägs ur de övriga med samma metod. */
function prediktionsfel(alla: Trakt[], forutsag: (ovriga: Trakt[], mal: Trakt) => number | null): number[] {
  const fel: number[] = [];
  alla.forEach((t, i) => {
    const ovriga = alla.filter((_, j) => j !== i);
    const p = forutsag(ovriga, t);
    if (p != null && p > 0) fel.push(t.rate / p);
  });
  return fel;
}

function intervallTim(volym: number, pred: number, fel: number[], basvag: number): { lag: number; hog: number } | null {
  if (fel.length < G15_MIN_FEL) return null;
  const rLag = pred * percentil(fel, 0.25), rHog = pred * percentil(fel, 0.75);
  return { lag: Math.round(volym / rHog + basvag), hog: Math.round(volym / rLag + basvag) };
}

function tomt(orsak: 'ingen-volym' | 'typ-saknas' | 'for-fa', antal: number, text: string): RollResultat { return { ok: false, orsak, antal, text }; }

export function beraknaG15Forslag(inp: G15Indata, rader: UtfallRad[]): G15Forslag {
  const typ = (inp.typ ?? '').trim().toLowerCase();
  if (!arPos(inp.volym)) {
    const t = tomt('ingen-volym', 0, 'Volym saknas — inget förslag');
    return { skordare: t, skotare: t };
  }
  if (typ !== 'slutavverkning' && typ !== 'gallring') {
    const t = tomt('typ-saknas', 0, 'Förslag finns för slutavverkning och gallring');
    return { skordare: t, skotare: t };
  }
  const volym = inp.volym;
  const basvag = arPos(inp.basvagTimmar) ? Math.round(inp.basvagTimmar) : 0;

  // ── Skördare ──
  let skordare: RollResultat;
  const sk = underlag(rader, typ, 'skordare');
  const par = arPos(inp.medelstam) ? [] : laserPar(rader, typ);
  const modell = !arPos(inp.medelstam) && arPos(inp.laserDiaCm) ? laserModell(par) : null;
  const laserRa = modell && arPos(inp.laserDiaCm) ? modell(inp.laserDiaCm) : null;
  // För få trakter med liknande medelstam: laserns gissning hjälper inte — då gäller snittet över typen, som förut.
  const laserMs = laserRa != null && jamforbara(sk, laserRa).length >= G15_MIN_TRAKTER ? laserRa : null;
  if (arPos(inp.medelstam) || laserMs != null) {
    const urLaser = !arPos(inp.medelstam);
    const ms = urLaser ? (laserMs as number) : (inp.medelstam as number);
    const jam = jamforbara(sk, ms);
    if (jam.length < G15_MIN_TRAKTER) {
      skordare = tomt('for-fa', jam.length, `Färre än ${G15_MIN_TRAKTER} jämförbara trakter (medelstam ${fmtMs(ms / G15_MEDELSTAMBAND)}–${fmtMs(ms * G15_MEDELSTAMBAND)}) — inget förslag`);
    } else {
      const pred = median(jam.map((t) => t.rate));
      const fel = urLaser
        // Hela kedjan: trakten förutsägs ur de ÖVRIGA — både sambandet diameter → medelstam och de jämförbara trakterna.
        ? prediktionsfel(sk.filter((t) => t.medelstam != null && t.dia != null), (ov, mal) => {
          const m = laserModell(ov.filter((t) => t.medelstam != null && t.dia != null).map((t) => ({ dia: t.dia!, medelstam: t.medelstam! })));
          if (!m) return null;
          const j = jamforbara(ov, m(mal.dia!));
          return j.length >= G15_MIN_TRAKTER ? median(j.map((t) => t.rate)) : null;
        })
        : prediktionsfel(sk.filter((t) => t.medelstam != null), (ov, mal) => {
          const j = jamforbara(ov, mal.medelstam!);
          return j.length >= G15_MIN_TRAKTER ? median(j.map((t) => t.rate)) : null;
        });
      const mss = jam.map((t) => t.medelstam!);
      skordare = { ok: true, forslag: {
        g15: Math.round(volym / pred), m3PerG15: pred, intervall: intervallTim(volym, pred, fel, 0), antal: jam.length,
        medelstamSpann: { lag: Math.min(...mss), hog: Math.max(...mss) }, metod: urLaser ? 'laser' : 'medelstam',
        ...(urLaser ? { laserMedelstam: Math.round(ms * 1000) / 1000 } : {}), basvagTim: 0, typ,
      } };
    }
  } else if (sk.length >= G15_MIN_TRAKTER) {
    const pred = median(sk.map((t) => t.rate));
    const fel = prediktionsfel(sk, (ov) => (ov.length >= G15_MIN_TRAKTER ? median(ov.map((t) => t.rate)) : null));
    skordare = { ok: true, forslag: {
      g15: Math.round(volym / pred), m3PerG15: pred, intervall: intervallTim(volym, pred, fel, 0), antal: sk.length,
      medelstamSpann: null, metod: 'snitt-medelstam-saknas', basvagTim: 0, typ,
    } };
  } else {
    skordare = tomt('for-fa', sk.length, `Färre än ${G15_MIN_TRAKTER} trakter av typen att räkna på — inget förslag`);
  }

  // ── Skotare: trakter som samma sorts skotare kört; annars snitt över alla trakter av typen ──
  let skotare: RollResultat;
  const so = underlag(rader, typ, 'skotare');
  const klass = inp.skotareKlass ?? null;
  const egna = klass ? so.filter((t) => t.klass === klass) : [];
  if (klass && egna.length >= G15_MIN_TRAKTER) {
    const pred = median(egna.map((t) => t.rate));
    const fel = prediktionsfel(egna, (ov) => (ov.length >= G15_MIN_TRAKTER ? median(ov.map((t) => t.rate)) : null));
    skotare = { ok: true, forslag: {
      g15: Math.round(volym / pred + basvag), m3PerG15: pred, intervall: intervallTim(volym, pred, fel, basvag), antal: egna.length,
      medelstamSpann: null, metod: 'maskin', skotareKlass: klass, basvagTim: basvag, typ,
    } };
  } else if (so.length >= G15_MIN_TRAKTER) {
    const pred = median(so.map((t) => t.rate));
    const fel = prediktionsfel(so, (ov) => (ov.length >= G15_MIN_TRAKTER ? median(ov.map((t) => t.rate)) : null));
    skotare = { ok: true, forslag: {
      g15: Math.round(volym / pred + basvag), m3PerG15: pred, intervall: intervallTim(volym, pred, fel, basvag), antal: so.length,
      medelstamSpann: null, metod: 'snitt-typ', basvagTim: basvag, typ,
    } };
  } else {
    skotare = tomt('for-fa', so.length, `Färre än ${G15_MIN_TRAKTER} trakter av typen att räkna på — inget förslag`);
  }
  return { skordare, skotare };
}

/** 0,64 · 1,0 · 0,7 — två decimaler, ett avslutande nolla bort, decimalkomma. */
export function fmtMs(v: number): string {
  return v.toFixed(2).replace('.', ',').replace(/0$/, '');
}

/** Metaraden under fältet: källan och det uppmätta felet. Ett tal som inte räknats fram skrivs aldrig. */
export function forslagKalla(f: RollForslag): string {
  const intervall = f.intervall ? `troligen ${f.intervall.lag}–${f.intervall.hog}` : 'spridning ej bedömd (för få trakter)';
  const typOrd = f.typ === 'gallring' ? 'gallringar' : 'slutavverkningar';
  if (f.metod === 'laser' && f.laserMedelstam != null) return `Medelstam ca ${fmtMs(f.laserMedelstam)} ur laserskanningen · ${intervall} · ur ${f.antal} liknande trakter`;
  if (f.metod === 'medelstam' && f.medelstamSpann) return `${intervall} · ur ${f.antal} trakter med medelstam ${fmtMs(f.medelstamSpann.lag)}–${fmtMs(f.medelstamSpann.hog)}`;
  if (f.metod === 'maskin') return `${intervall} · ur ${f.antal} ${typOrd} som samma sorts skotare kört`;
  if (f.metod === 'snitt-medelstam-saknas') return `Medelstam saknas – snitt över alla trakter · ur ${f.antal} ${typOrd} · ${intervall}`;
  return `${intervall} · ur ${f.antal} ${typOrd} (snitt)`;
}

/** "slutavverkningar" / "gallringar" när förslaget räknats som snitt över ALLA trakter av typen för att medelstam saknas; annars null. */
export function snittTypOrd(f: RollForslag): string | null {
  return f.metod === 'snitt-medelstam-saknas' ? (f.typ === 'gallring' ? 'gallringar' : 'slutavverkningar') : null;
}

export interface PrestationVarning {
  /** 'lagt' = fler timmar än förslagets intervall (låg prestation), 'hogt' = färre timmar (hög prestation) */
  riktning: 'lagt' | 'hogt';
  /** liknande trakter, omräknat till m³fub per G15-tim (volym / intervallets timmar) */
  lag: number;
  hog: number;
}

/**
 * Ligger prognosens G15-tim UTANFÖR förslagets intervall? Då är prestationen (volym / tim) ovanlig mot liknande trakter och planeraren ska se det — men får ändå godkänna.
 * Ingen varning utan förslag, utan bedömt intervall eller utan volym/tim att räkna på. Gränserna själva räknas som inom intervallet.
 */
export function prestationVarning(volym: number | null, tim: number | null, intervall: { lag: number; hog: number } | null | undefined): PrestationVarning | null {
  if (!arPos(volym) || !arPos(tim) || !intervall || !(intervall.lag > 0) || !(intervall.hog > 0)) return null;
  if (tim >= intervall.lag && tim <= intervall.hog) return null;
  return { riktning: tim > intervall.hog ? 'lagt' : 'hogt', lag: volym / intervall.hog, hog: volym / intervall.lag };
}

/** Prestation m³fub per G15-timme — uträknad, aldrig ett eget fält. null när något saknas. */
export function prestation(volym: number | null, g15Tim: number | null): number | null {
  if (!arPos(volym) || !arPos(g15Tim)) return null;
  return volym / g15Tim;
}
