// Maskiner (Uppföljning, steg 2): vad lastbilen flyttat per maskin under ett år. Rena funktioner — läsningen ligger i
// lasMaskiner.ts. Underlaget är maskin_flytt (en rad per flytt), INTE rundorna: en runda kan rymma flera flyttar, och en
// automatisk flytt kan sakna runda, så antalet här är flyttar och stämmer inte mot rundantalet i resten av sidan.
//
// Regler (Martin 2026-10-20):
//  - Saknas km eller tid på en flytt räknas den inte i snittet av just det, och det sägs ("N flyttar saknar km").
//  - Snitt visas först från MIN_FLYTTAR_SNITT räknade flyttar, och antalet står alltid med ("snitt av 4 flyttar").
//  - "På en trakt" = tid från förra flyttens lossning till nästa flyttens lastning, och räknas BARA när förra flyttens Till
//    är samma trakt eller plats som nästa flyttens Från. Annars har maskinen flyttats på ett sätt som inte registrerats.
//  - Andras maskiner (kunduppdrag) samlas i en egen sista rad; de saknar position, så ingen "Står på" och inget "På en trakt".

import { sthlmDelar } from '@/lib/sthlmTid';

export const MIN_FLYTTAR_SNITT = 3;
export const EXTERN_NYCKEL = 'extern';

/** En rad ur maskin_flytt, som den läses. */
export interface FlyttRad {
  id: string;
  maskin_id: string | null;
  extern_maskin: string | null;
  starttid: string | null;
  hamtad_tid: string | null;
  sluttid: string;
  flytt_km: number | null;
  tid_flytt_min: number | null;
  fran_objekt_id: string | null;
  fran_plats_id: string | null;
  till_objekt_id: string | null;
  till_plats_id: string | null;
}

export interface Flytt {
  id: string;
  nyckel: string;                 // maskin_id, eller 'extern'
  maskinNamn: string;
  lastad: string;                 // hamtad_tid, annars flödets starttid
  lossad: string;
  km: number | null;
  min: number | null;
  franId: string | null;          // 'o:<objekt>' | 'p:<plats>' — samma nyckel för samma ställe
  tillId: string | null;
  franNamn: string | null;
  tillNamn: string | null;
}

export interface Maskin {
  nyckel: string;
  namn: string;
  extern: boolean;
  flyttar: Flytt[];               // nyast först (lossad)
  antal: number;
  km: number;                     // summa av avrundade flyttar som HAR km
  saknarKm: number;
}

const platsNyckel = (o: string | null, p: string | null) => (o ? `o:${o}` : p ? `p:${p}` : null);

export function byggFlyttar(
  rader: readonly FlyttRad[],
  maskinNamn: ReadonlyMap<string, string>, objektNamn: ReadonlyMap<string, string>, platsNamn: ReadonlyMap<string, string>,
): Flytt[] {
  return rader.map(r => {
    const franId = platsNyckel(r.fran_objekt_id, r.fran_plats_id), tillId = platsNyckel(r.till_objekt_id, r.till_plats_id);
    const plats = (o: string | null, p: string | null) => (o && objektNamn.get(o)) || (p && platsNamn.get(p)) || null;
    return {
      id: r.id,
      nyckel: r.maskin_id ?? EXTERN_NYCKEL,
      maskinNamn: r.maskin_id ? (maskinNamn.get(r.maskin_id) ?? r.maskin_id) : (r.extern_maskin || 'Okänd maskin'),
      lastad: r.hamtad_tid ?? r.starttid ?? r.sluttid,
      lossad: r.sluttid,
      km: r.flytt_km != null ? Number(r.flytt_km) : null,
      min: r.tid_flytt_min != null ? Number(r.tid_flytt_min) : null,
      franId, tillId,
      franNamn: plats(r.fran_objekt_id, r.fran_plats_id), tillNamn: plats(r.till_objekt_id, r.till_plats_id),
    };
  });
}

/** En rad per maskin: flest flyttar först, sedan flest km, sedan namn. Andras maskiner (om några) allra sist. */
export function grupperaMaskiner(flyttar: readonly Flytt[]): Maskin[] {
  const per = new Map<string, Flytt[]>();
  for (const f of flyttar) per.set(f.nyckel, [...(per.get(f.nyckel) ?? []), f]);
  const maskiner: Maskin[] = Array.from(per, ([nyckel, fl]) => {
    const sorterade = [...fl].sort((a, b) => Date.parse(b.lossad) - Date.parse(a.lossad));
    const medKm = sorterade.filter(f => f.km != null);
    return {
      nyckel, extern: nyckel === EXTERN_NYCKEL,
      namn: nyckel === EXTERN_NYCKEL ? 'Andras maskiner' : sorterade[0].maskinNamn,
      flyttar: sorterade, antal: sorterade.length,
      km: medKm.reduce((s, f) => s + Math.round(f.km as number), 0), saknarKm: sorterade.length - medKm.length,
    };
  });
  return maskiner.sort((a, b) => Number(a.extern) - Number(b.extern) || b.antal - a.antal || b.km - a.km || a.namn.localeCompare(b.namn, 'sv'));
}

/** Ett snitt och vad det bygger på. `snitt` är null när för få flyttar räknades. */
export interface Snitt { snitt: number | null; antal: number; saknar: number }

function snittAv(varden: readonly (number | null)[]): Snitt {
  const med = varden.filter((v): v is number => v != null);
  return {
    antal: med.length, saknar: varden.length - med.length,
    snitt: med.length >= MIN_FLYTTAR_SNITT ? med.reduce((s, v) => s + v, 0) / med.length : null,
  };
}

const DYGN = 86400000;

export interface MaskinSammanfattning {
  tid: Snitt;                      // minuter lassat → lossat
  km: Snitt;
  /** Dagar på en trakt. `antal` = räknade mellanrum, `saknar` = mellanrum som inte går att räkna (annan eller okänd plats). Null för andras maskiner. */
  trakt: Snitt | null;
}

export function sammanfatta(m: Maskin): MaskinSammanfattning {
  let trakt: Snitt | null = null;
  if (!m.extern) {
    const stigande = [...m.flyttar].reverse();
    const dagar: (number | null)[] = [];
    for (let i = 1; i < stigande.length; i++) {
      const forra = stigande[i - 1], nasta = stigande[i];
      const gap = (Date.parse(nasta.lastad) - Date.parse(forra.lossad)) / DYGN;
      dagar.push(forra.tillId && forra.tillId === nasta.franId && gap >= 0 ? gap : null);
    }
    trakt = snittAv(dagar);
  }
  return { tid: snittAv(m.flyttar.map(f => f.min)), km: snittAv(m.flyttar.map(f => f.km)), trakt };
}

/** Hela dagar (Stockholms kalenderdagar) från `iso` till `nu`. */
export function dagarSedan(iso: string, nu: Date): number | null {
  const a = sthlmDelar(new Date(iso)), b = sthlmDelar(nu);
  if (!a || !b) return null;
  return Math.max(0, Math.round((Date.UTC(b.ar, b.man - 1, b.dag) - Date.UTC(a.ar, a.man - 1, a.dag)) / DYGN));
}

/** "Står på Östra-Höka sedan 12 dagar". Bara för en egen maskin, och bara om året är innevarande (annars är "nu" meningslöst). */
export function starPa(m: Maskin, nu: Date): string | null {
  if (m.extern || m.flyttar.length === 0) return null;
  const sista = m.flyttar[0];
  const d = dagarSedan(sista.lossad, nu);
  if (d == null || !sista.tillNamn) return null;
  return `Står på ${sista.tillNamn} sedan ${d === 0 ? 'idag' : d === 1 ? '1 dag' : `${d} dagar`}`;
}

// ── Text ─────────────────────────────────────────────────────────────────────────────────────────

export const fmtDagar = (d: number): string => {
  const r = Math.round(d * 10) / 10;
  return r === 1 ? '1 dag' : `${r.toLocaleString('sv-SE')} dagar`;
};

const plural = (n: number, ett: string, flera: string) => `${n} ${n === 1 ? ett : flera}`;

/**
 * Raden under ett snitt, dämpad: bara vad snittet bygger på. "snitt av 4 flyttar" · "bara 2 flyttar – för få för snitt".
 * `saknasText` ges bara för en rad som en saknad uppgift PÅVERKAR (km- och tidsraden: "1 flytt saknar km"); raden "På en trakt" får
 * ingen — mellanrum som inte går att räkna nämns inte.
 */
export function snittUnder(s: Snitt, enhet: { ett: string; flera: string; ingen: string }, saknasText?: (n: number) => string): string {
  // Inget räknat men något saknas: säg bara vad som saknas ("11 flyttar saknar tid") — "ingen flytt att räkna på" vore dubbelt.
  if (s.antal === 0 && s.saknar > 0 && saknasText) return saknasText(s.saknar);
  const grund = s.snitt != null
    ? `snitt av ${plural(s.antal, enhet.ett, enhet.flera)}`
    : s.antal === 0 ? `${enhet.ingen} att räkna på` : `bara ${plural(s.antal, enhet.ett, enhet.flera)} – för få för snitt`;
  return s.saknar > 0 && saknasText ? `${grund} · ${saknasText(s.saknar)}` : grund;
}

export const FLYTT = { ett: 'flytt', flera: 'flyttar', ingen: 'ingen flytt' } as const;
export const MELLANRUM = { ett: 'mellanrum', flera: 'mellanrum', ingen: 'inget mellanrum' } as const;
export const saknarKmText = (n: number) => `${plural(n, 'flytt', 'flyttar')} saknar km`;
export const saknarTidText = (n: number) => `${plural(n, 'flytt', 'flyttar')} saknar tid`;

// ── Sammanställningen per maskin (Martin 2026-10-24: "hur många flyttar varje maskin gjort varje månad, och vad tiden tar") ──

const MANAD_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const manadKort = (man: number) => MANAD_KORT[man - 1];

/** Svensk månad (1–12) då flytten lossades. */
const lossadManad = (f: Flytt): number | null => sthlmDelar(new Date(f.lossad))?.man ?? null;

/**
 * Månaderna staplarna visar — SAMMA för alla maskiner så att de går att jämföra: från första månaden någon maskin
 * flyttades till den sista (innevarande månad när året pågår). Tomt när inga flyttar finns.
 */
export function manaderAttVisa(maskiner: readonly Maskin[], ar: number, nu: Date): number[] {
  const man = maskiner.flatMap(m => m.flyttar.map(lossadManad)).filter((v): v is number => v != null);
  if (man.length === 0) return [];
  const n = sthlmDelar(nu);
  const sista = n && n.ar === ar ? Math.max(n.man, ...man) : Math.max(...man);
  return Array.from({ length: sista - Math.min(...man) + 1 }, (_, i) => Math.min(...man) + i);
}

/** Antal flyttar per månad för en maskin, i månadernas ordning (0 när maskinen inte flyttades). */
export function perManad(m: Maskin, manader: readonly number[]): { man: number; antal: number }[] {
  return manader.map(man => ({ man, antal: m.flyttar.filter(f => lossadManad(f) === man).length }));
}

/** Tiden på lastbilen (lastad → lossad) för årets flyttar, i hela minuter; flyttar utan tid räknas inte och sägs. */
export function tidPaLastbilen(m: Maskin): { min: number; saknar: number } {
  const med = m.flyttar.filter(f => f.min != null);
  return { min: med.reduce((s, f) => s + Math.round(f.min as number), 0), saknar: m.flyttar.length - med.length };
}
