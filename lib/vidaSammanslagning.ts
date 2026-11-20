// SLÅ IHOP MED VIDA — bara jobb som är märkta "Väntar på Vida".
//
// Ett jobb från Starta jobb (P-VO, ursprung 'vanta_vida') föds när Vida inte levererat objektet än. När Vida sedan importerar objektet
// (import-trakt skapar en NY rad — den matchar bara på vo_nummer och jobbet har ett P-VO) ligger jobbets position eller hyttspår inne i
// det nya objektets traktgräns. Då FÖRESLÅR vi: "P-1018 har fått Vida-objekt <namn> — slå ihop?". Föraren/admin bekräftar; systemet
// flyttar aldrig något på egen hand. Privata jobb frågas ALDRIG.
//
// Det här är de RENA delarna: vilka jobb/objekt som kan komma i fråga, och om en traktgräns täcker ett jobb. Själva flyttningen bor i
// lib/server/slaIhopJobb.ts (service-roll). Båda sidorna använder samma träffregel — servern räknar om innan den flyttar något.

import { objektInnehallerPunkt, type TraktGeometriFC } from './objektPlats';

/** Så stor andel av jobbets hyttspårspunkter ska ligga inne i traktgränsen för att spåret räknas som "inom" objektet… */
export const SPAR_ANDEL_MIN = 0.5;
/** …och minst så många punkter inne (ett par enstaka punkter är ingen körning i trakten). */
export const SPAR_PUNKTER_MIN = 3;

export interface SparPunkt { lat: number; lng: number }

export interface JobbForSla {
  id: string;
  namn?: string | null;
  vo_nummer?: string | null;
  ursprung?: string | null;
  lat?: number | null;
  lng?: number | null;
  created_at?: string | null;
  /** objekt.id:n föraren redan sagt nej till (sla_ihop_avvisade). */
  sla_ihop_avvisade?: string[] | null;
}

export interface VidaObjektForSla {
  id: string;
  namn?: string | null;
  vo_nummer?: string | null;
  ursprung?: string | null;
  kalla?: string | null;
  lat?: number | null;
  lng?: number | null;
  created_at?: string | null;
  geometri?: TraktGeometriFC | null;
}

const arPVo = (vo: string | null | undefined): boolean => /^P-/i.test((vo || '').trim());

/** Ett jobb som väntar på Vida: märkt så OCH med P-VO. (Privat/vanligt objekt frågas aldrig.) */
export function arVantaVidaJobb(o: Pick<JobbForSla, 'ursprung' | 'vo_nummer'> | null | undefined): boolean {
  return !!o && o.ursprung === 'vanta_vida' && arPVo(o.vo_nummer);
}

/** Ett riktigt Vida-objekt att slå ihop MED: inget P-VO, inte själv ett Starta jobb-jobb, inte märkt privat/väntar. */
export function arVidaObjekt(o: Pick<VidaObjektForSla, 'ursprung' | 'vo_nummer' | 'kalla'> | null | undefined): boolean {
  return !!o && !o.ursprung && !arPVo(o.vo_nummer) && o.kalla !== 'starta-jobb' && !!(o.vo_nummer || '').trim();
}

export type TackOrsak = 'hyttspar' | 'position';
export interface TraktTacker {
  tacker: boolean;
  orsak: TackOrsak | null;
  /** Andel av jobbets spårpunkter inne i gränsen (0–1), null om jobbet saknar spår. */
  andelSpar: number | null;
  punkterInne: number;
}

/** Täcker objektets traktgräns jobbet? Hyttspåret först (det är där arbetet faktiskt skett), annars jobbets position. */
export function traktTackerJobb(
  geometri: TraktGeometriFC | null | undefined,
  jobb: { lat?: number | null; lng?: number | null },
  punkter: SparPunkt[],
): TraktTacker {
  let inne = 0;
  for (const p of punkter) if (objektInnehallerPunkt(geometri, p.lat, p.lng)) inne++;
  const andel = punkter.length > 0 ? inne / punkter.length : null;
  if (andel != null && inne >= SPAR_PUNKTER_MIN && andel >= SPAR_ANDEL_MIN) return { tacker: true, orsak: 'hyttspar', andelSpar: andel, punkterInne: inne };
  const lat = jobb.lat == null ? NaN : Number(jobb.lat), lng = jobb.lng == null ? NaN : Number(jobb.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && objektInnehallerPunkt(geometri, lat, lng)) {
    return { tacker: true, orsak: 'position', andelSpar: andel, punkterInne: inne };
  }
  return { tacker: false, orsak: null, andelSpar: andel, punkterInne: inne };
}

export interface SlaIhopForslag {
  jobbId: string;
  vidaId: string;
  orsak: TackOrsak;
  andelSpar: number | null;
}

/** Ett förslag per jobb (det bästa Vida-objektet). Hoppar över avvisade par. Inget förslag för privata jobb. */
export function hittaSlaIhopForslag(args: {
  jobb: JobbForSla[];
  vida: VidaObjektForSla[];
  /** Jobbets hyttspårspunkter (alla dagar, båda roller) per jobb-id. */
  sparPerJobb: Map<string, SparPunkt[]>;
}): SlaIhopForslag[] {
  const ut: SlaIhopForslag[] = [];
  const kandidater = args.vida.filter(arVidaObjekt);
  for (const j of args.jobb) {
    if (!arVantaVidaJobb(j)) continue;
    const avvisade = new Set(j.sla_ihop_avvisade || []);
    const punkter = args.sparPerJobb.get(j.id) ?? [];
    type Traff = { v: VidaObjektForSla; t: TraktTacker; avst: number };
    const traffar: Traff[] = [];
    for (const v of kandidater) {
      if (avvisade.has(v.id)) continue;
      const t = traktTackerJobb(v.geometri, j, punkter);
      if (!t.tacker) continue;
      traffar.push({ v, t, avst: avstandKvadrat(j, v) });
    }
    if (traffar.length === 0) continue;
    traffar.sort((a, b) =>
      (a.t.orsak === b.t.orsak ? 0 : a.t.orsak === 'hyttspar' ? -1 : 1)          // spår före bara position
      || ((b.t.andelSpar ?? -1) - (a.t.andelSpar ?? -1))                          // mest av spåret inne först
      || (a.avst - b.avst)                                                         // sedan närmast jobbets punkt
      || String(b.v.created_at || '').localeCompare(String(a.v.created_at || '')) // sedan senast importerad
      || String(a.v.id).localeCompare(String(b.v.id)));
    const b = traffar[0];
    ut.push({ jobbId: j.id, vidaId: b.v.id, orsak: b.t.orsak!, andelSpar: b.t.andelSpar });
  }
  return ut;
}

function avstandKvadrat(a: { lat?: number | null; lng?: number | null }, b: { lat?: number | null; lng?: number | null }): number {
  const la = Number(a.lat), lo = Number(a.lng), lb = Number(b.lat), lp = Number(b.lng);
  if (![la, lo, lb, lp].every(Number.isFinite)) return Infinity;
  return (la - lb) ** 2 + (lo - lp) ** 2;
}

/** Förslagsraden i Starta jobb-vyn. */
export function forslagText(jobb: Pick<JobbForSla, 'vo_nummer' | 'namn'>, vida: Pick<VidaObjektForSla, 'namn' | 'vo_nummer'>): string {
  const jobbet = (jobb.vo_nummer || jobb.namn || 'Jobbet').trim();
  const objektet = (vida.namn || vida.vo_nummer || 'ett objekt').trim();
  return `${jobbet} har fått Vida-objekt ${objektet} — slå ihop?`;
}
