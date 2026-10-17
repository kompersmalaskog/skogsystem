// G15-FÖRSLAG för prognosen i "Klar med trakten?" — räknat ur UPPMÄTT utfall, inte ur tidigare planerade timmar.
//
// Underlaget är avslutade trakter av samma typ (slutavverkning/gallring) där både skördad volym och G15 finns i skördar-/maskindatan (`prognos_utfall()`,
// migration 20261017095842). Ur varje trakt räknas prestationen m³fub per G15-timme. G15 = (processing + terräng + övrigt arbete) / 3600, summerad av databasfunktionen.
//
// SKÖRDARE räknas mot trakter med LIKNANDE MEDELSTAM (±25 %, minst 3): medelstam förklarar ca två tredjedelar av variationen i prestation (uppmätt: r² 0,65 slutavverkning,
// 0,72 gallring). Saknas trakter med liknande medelstam finns inget förslag (tomt, orange) — appen gissar inte. Saknas medelstam på DEN HÄR trakten används snitt över alla
// trakter av typen och det SÄGS.
// SKOTARE räknas som snitt över alla trakter av typen: medelstam hjälpte inte skotaren (r² 0,06) och jämförbara trakter blev inte bättre än snittet.
//
// INTERVALLET ("troligen 38–45") är UPPMÄTT prediktionsfel, inte spridningen bland jämförbara trakter (den ger falsk säkerhet): varje trakt förutsägs med samma metod ur
// de övriga (leave-one-out) och 25:e–75:e percentilen av faktisk/förutsagd prestation sätter intervallet. Färre än 5 sådana fel → inget intervall, och det står.
//
// UTESLUTNING: en trakt vars skördade volym avviker mycket från objektets volym (0,7–1,4 av `objekt.volym`) räknas inte med — då är datan ofullständig (Kroksjömåla:
// 315 av 860 m³, Bågskyttebanan 1 687 av 3 495). Trakter utan känd objektvolym kan inte testas och behålls. G15 under 8 tim räknas inte (för kort för en tillförlitlig kvot).
//
// Gamla prognoser (Jockes planerade timmar i manuell_prognos) används inte som underlag.

export const G15_MIN_TRAKTER = 3;
export const G15_MIN_TIM = 8;
export const G15_VOLYMFONSTER = { lag: 0.7, hog: 1.4 } as const;
/** Medelstam ±25 %: förhållandet jämförbar/mål ska ligga mellan 1/1,25 och 1,25. */
export const G15_MEDELSTAMBAND = 1.25;
export const G15_MIN_FEL = 5;

export interface UtfallRad {
  typ: string | null;
  /** objekt.volym (Vidas volym, m³fub) — null = okänd, då kan fullständigheten inte testas */
  volymObjekt: number | null;
  /** skördad volym (m³sub = m³fub) ur skördardatan */
  skordadM3: number | null;
  stammar: number | null;
  skordareG15: number | null;
  skotareG15: number | null;
}

export interface G15Indata {
  typ: string | null;
  volym: number | null;
  medelstam: number | null;
  /** engångstid för basvägsanläggning, läggs på SKOTARENS förslag (som förut) */
  basvagTimmar?: number | null;
}

export type Metod = 'medelstam' | 'snitt-medelstam-saknas' | 'snitt-typ';

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
  metod: Metod;
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

interface Trakt { rate: number; medelstam: number | null }

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
    ut.push({ rate: r.skordadM3 / g15, medelstam });
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
  if (arPos(inp.medelstam)) {
    const ms = inp.medelstam;
    const jam = jamforbara(sk, ms);
    if (jam.length < G15_MIN_TRAKTER) {
      skordare = tomt('for-fa', jam.length, `Färre än ${G15_MIN_TRAKTER} jämförbara trakter (medelstam ${fmtMs(ms / G15_MEDELSTAMBAND)}–${fmtMs(ms * G15_MEDELSTAMBAND)}) — inget förslag`);
    } else {
      const pred = median(jam.map((t) => t.rate));
      const fel = prediktionsfel(sk.filter((t) => t.medelstam != null), (ov, mal) => {
        const j = jamforbara(ov, mal.medelstam!);
        return j.length >= G15_MIN_TRAKTER ? median(j.map((t) => t.rate)) : null;
      });
      const mss = jam.map((t) => t.medelstam!);
      skordare = { ok: true, forslag: {
        g15: Math.round(volym / pred), m3PerG15: pred, intervall: intervallTim(volym, pred, fel, 0), antal: jam.length,
        medelstamSpann: { lag: Math.min(...mss), hog: Math.max(...mss) }, metod: 'medelstam', basvagTim: 0, typ,
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

  // ── Skotare: snitt över alla trakter av typen ──
  let skotare: RollResultat;
  const so = underlag(rader, typ, 'skotare');
  if (so.length >= G15_MIN_TRAKTER) {
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
  if (f.metod === 'medelstam' && f.medelstamSpann) return `${intervall} · ur ${f.antal} trakter med medelstam ${fmtMs(f.medelstamSpann.lag)}–${fmtMs(f.medelstamSpann.hog)}`;
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
