// "Vilken maskin?" — texterna och reglerna för raden på /lastbil och svarsarket. Rena funktioner (testas utan nät); anropen mot
// databasen (besvara_lass / avvisa_lass) har sina egna tolkare så ett svar aldrig kan se lyckat ut när det inte var det.
//
// Läsningarna visar det detekteringen vet, aldrig mer: en sträcka som bilen kört vidare på är "cirka", en saknad kund är en egen
// fråga ("Vilken kund?"), och en maskin som inte följde bilen står inte som förslag.

import { fakturerbarEffektiv } from '@/lib/flytt/fakturerbar';
import { skalRad, uteslutenText, type Kandidat, type Sakerhet } from '@/lib/lastbil/lass/maskin';
import { kortNamn } from '@/lib/lastbil/lass/notis';
import { bedomPlats, fmtPlatsAvstand, type PlatsBedomning, type PlatsPunkt } from '@/lib/lastbil/lass/platsGrad';
import { samtidigaUrBevis, samtidigText, type SamtidigFlytt } from '@/lib/lastbil/lass/samtidig';
import { fmtDatum, fmtKlocka } from './nu';

export interface LassRad {
  id: string;
  status: string;
  status_orsak: string | null;
  fran_namn: string | null;
  till_namn: string | null;
  lassning_lat?: number | null;
  lassning_lng?: number | null;
  lossning_lat?: number | null;
  lossning_lng?: number | null;
  lassning_tid: string;
  lossning_tid: string;
  km: number | null;
  lastvikt_kg?: number | null;
  forslag_maskin_id: string | null;
  sakerhet: Sakerhet;
  kandidater: Kandidat[];
  bevis: { km_osaker?: boolean; historisk?: boolean; flytt_samma_tid?: SamtidigFlytt[] } | null;
  kund: string | null;
  till_plats_id: string | null;
  besvarad_av: string | null;
  besvarad_tid: string | null;
  skapad_tid: string;
}

export const LASS_KOLUMNER =
  'id, status, status_orsak, fran_namn, till_namn, lassning_lat, lassning_lng, lossning_lat, lossning_lng, lassning_tid, lossning_tid, km, lastvikt_kg, forslag_maskin_id, sakerhet, kandidater, bevis, kund, till_plats_id, besvarad_av, besvarad_tid, skapad_tid';

const komma = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

export const lassRuttText = (r: Pick<LassRad, 'fran_namn' | 'till_namn'>): string =>
  `${kortNamn(r.fran_namn)} → ${kortNamn(r.till_namn)}`;

const platsText = (b: PlatsBedomning | null, sparat: string | null): string => {
  if (!b) return kortNamn(sparat);                       // positionen saknas: går inte att bedöma, det sparade namnet som förut
  if (b.typ === 'okand') return 'okänd plats';
  return b.typ === 'saker' ? kortNamn(b.namn) : `nära ${kortNamn(b.namn)}`;
};

export interface LassRuttVy {
  /** "Spåramåla RP 2025 → nära Intaget gallring" */
  rutt: string;
  /** Dämpade rader under rutten: "även Åbogen 673 m, Sandåsen 1 km". Bara osäkra platser har en; `sida` sätts bara när båda har. */
  andra: { sida: 'Från' | 'Till'; text: string }[];
}

/**
 * Rutten med platsernas säkerhet (platsGrad.ts): en SÄKER plats skrivs som namn, en OSÄKER som "nära <närmaste>" med de andra under,
 * och inget inom 8 km är "okänd plats". `kandidater` null = trakterna är inte lästa (än, eller läsfel): då står de sparade namnen
 * som förut. Bara visning — flytten får fortfarande den närmaste trakten.
 */
export function lassRuttVy(
  r: Pick<LassRad, 'fran_namn' | 'till_namn' | 'lassning_lat' | 'lassning_lng' | 'lossning_lat' | 'lossning_lng'>,
  kandidater: readonly PlatsPunkt[] | null,
): LassRuttVy {
  if (!kandidater) return { rutt: lassRuttText(r), andra: [] };
  const fran = bedomPlats(r.lassning_lat ?? null, r.lassning_lng ?? null, kandidater);
  const till = bedomPlats(r.lossning_lat ?? null, r.lossning_lng ?? null, kandidater);
  const rader = ([['Från', fran], ['Till', till]] as const)
    .filter((x): x is readonly ['Från' | 'Till', Extract<PlatsBedomning, { typ: 'osaker' }>] => x[1]?.typ === 'osaker' && x[1].andra.length > 0)
    .map(([sida, b]) => ({ sida, text: `även ${b.andra.map(a => `${kortNamn(a.namn)} ${fmtPlatsAvstand(a.avstandM)}`).join(', ')}` }));
  return { rutt: `${platsText(fran, r.fran_namn)} → ${platsText(till, r.till_namn)}`, andra: rader };
}

/** "mån 12 okt · 12:23 → 13:46". */
export const lassTidText = (r: Pick<LassRad, 'lassning_tid' | 'lossning_tid'>): string =>
  `${fmtDatum(r.lassning_tid)} · ${fmtKlocka(r.lassning_tid)} → ${fmtKlocka(r.lossning_tid)}`;

/** Sträckan ur bilens mätare. "cirka" när bilen inte stod stilla i båda ändar (då är den en uppskattning). */
export function lassKmText(r: Pick<LassRad, 'km' | 'bevis'>): string {
  if (r.km == null) return 'sträcka saknas';
  return `${r.bevis?.km_osaker ? 'cirka ' : ''}${komma(r.km)} km`;
}

/** "last 25 t" — lastvikten (lastad minus tom, ±5 t) i hela ton, så den som svarar kan känna igen maskinen. Saknas den: null, aldrig "0 t". */
export function lassViktText(r: Pick<LassRad, 'lastvikt_kg'>): string | null {
  const kg = r.lastvikt_kg;
  if (kg == null || !Number.isFinite(kg)) return null;
  const ton = Math.round(kg / 1000);
  return ton > 0 ? `last ${ton} t` : null;
}

export const lassFakturerbar = (r: Pick<LassRad, 'km'>, extern: boolean): boolean =>
  r.km != null && fakturerbarEffektiv(extern ? 'kunduppdrag' : 'produktion', r.km, null);

/** En rad som säger varför platsen kan vara fel — och vad man gör åt det. null = inget att säga. */
export function lassPlatsNot(r: Pick<LassRad, 'status_orsak' | 'bevis'>): string | null {
  if (r.status_orsak === 'plats_osaker' || r.bevis?.km_osaker) {
    return 'Platsen är osäker — bilen hade kört vidare när vikten ändrades. Kontrollera Från, Till och sträckan under Att godkänna.';
  }
  if (r.status_orsak === 'auto_misslyckades') return 'Flytten kunde inte skapas av sig själv. Välj maskin så skapas den nu.';
  return null;
}

/**
 * Rader om förarens registrerade flytt på samma tid ("En flytt med H8E -23 finns samma tid"), så den som svarar kan avvisa lasset i
 * stället för att dubblera. Bara de historiska lassen har dem. `namnFor` slår upp visningsnamnet ur maskinlistan (null = inte läst än).
 */
export function lassSamtidigaRader(r: Pick<LassRad, 'bevis'>, namnFor: (maskinId: string) => string | null): string[] {
  return samtidigaUrBevis(r.bevis).map(s => samtidigText(s, s.maskin_id ? namnFor(s.maskin_id) : null));
}

const SAKERHET_ORD: Record<Sakerhet, string> = { hog: 'Säker', medel: 'Troligen', lag: 'Osäkert', okand: '' };

/** Raden under förslaget: hur säkert, och de två bästa skälen. */
export function lassForslagText(r: Pick<LassRad, 'forslag_maskin_id' | 'sakerhet' | 'kandidater'>): string | null {
  if (!r.forslag_maskin_id) return null;
  const k = (r.kandidater ?? []).find(x => x.maskin_id === r.forslag_maskin_id);
  const skal = k ? skalRad(k.skal) : '';
  return [SAKERHET_ORD[r.sakerhet], skal].filter(Boolean).join(' · ') || null;
}

/** Raden under en annan maskin: bara det som talar emot ("Följde inte bilen") eller för den. */
export function lassMaskinText(r: Pick<LassRad, 'kandidater'>, maskinId: string): string | null {
  const k = (r.kandidater ?? []).find(x => x.maskin_id === maskinId);
  if (!k) return null;
  if (k.utesluten) return uteslutenText(k.skal);
  return skalRad(k.skal) || null;
}

export interface Val { maskinId: string | null; extern: string; kund: string }

/** Behövs en kundruta? Alltid för maskin som inte är vår (kunduppdrag), annars när flytten faktureras och traktens bolag saknas. */
export function kravKundRuta(r: Pick<LassRad, 'km' | 'kund'>, v: Pick<Val, 'maskinId' | 'extern'>): boolean {
  const extern = !!v.extern.trim();
  if (extern) return true;
  return !!v.maskinId && lassFakturerbar(r, false) && !(r.kund ?? '').trim();
}

/** Varför Skapa-knappen är grå — null = allt som krävs är ifyllt. */
export function saknasForSvar(r: Pick<LassRad, 'km' | 'kund'>, v: Val, externVald: boolean): string | null {
  if (externVald) {
    if (!v.extern.trim()) return 'Skriv maskinens namn';
    if (!v.kund.trim()) return 'Välj kund — flytten faktureras';
    return null;
  }
  if (!v.maskinId) return 'Välj maskin';
  if (kravKundRuta(r, v) && !v.kund.trim()) return 'Välj kund — flytten faktureras';
  return null;
}

export type SvarUtfall =
  | { typ: 'klart'; flyttId: string | null }
  | { typ: 'redan'; status: string; av: string | null; tid: string | null }
  | { typ: 'fel'; fel: string };

/** Tolkar svaret från besvara_lass / avvisa_lass. `ok:false` utan `redan` är ett fel, aldrig ett lyckat tryck. */
export function tolkaSvar(data: any, error: { message?: string } | null): SvarUtfall {
  if (error) return { typ: 'fel', fel: error.message || 'Kunde inte spara. Försök igen.' };
  if (data?.redan) return { typ: 'redan', status: String(data.status ?? ''), av: data.av ?? null, tid: data.tid ?? null };
  if (data?.ok === true) return { typ: 'klart', flyttId: data.flytt_id ?? null };
  return { typ: 'fel', fel: 'Kunde inte spara. Försök igen.' };
}

/** "Redan besvarat" — vem och när, i ord. */
export function redanText(u: { status: string; av: string | null; tid: string | null }): string {
  const av = u.av && u.av !== 'auto' && u.av !== 'matchad' ? u.av.split(' ')[0] : null;
  const nar = u.tid ? ` ${fmtKlocka(u.tid)}` : '';
  switch (u.status) {
    case 'auto_flytt': return av ? `${av} svarade${nar}. Flytten ligger under Att godkänna.` : 'Flytten skapades redan av sig själv. Den ligger under Att godkänna.';
    case 'matchad_manuell': return 'Föraren hade redan registrerat flytten. Lasset är kopplat till den.';
    case 'avvisad': return `${av ?? 'Någon'} markerade det som ingen maskinflytt${nar}.`;
    default: return 'Lasset är redan hanterat.';
  }
}
