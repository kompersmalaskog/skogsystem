// ÖVERBLICK NÄR MASKINEN BÖRJAR PÅ EN TRAKT (Martin 2026-11-04, efter Stefan i Giant: "när han börjar på ett objekt vill han få helheten
// av avverkningen, samlat på ett ställe, utan att trycka runt på kartan").
//
// Första gången en maskin öppnar en trakt visas överblicken av sig själv: kartan visar hela trakten och panelen säger allt på EN sida —
// faror, Vidas direktiv och planerarens text, det som avviker inför jobbet (band, ved, manuell fällning …) och vad som finns utmärkt.
// "Börja köra" stänger den och sparar vad som setts. Ändrar planeraren något efteråt kommer den tillbaka — och det nya är märkt "Nytt".
// Den går alltid att öppna igen via "Visa hela trakten" på förarens kort. Allt tryck på kartan fungerar som förut.
//
// Ren logik + enhetens minne (localStorage, per maskin och trakt). Inget sparas i databasen.

import type { SammanfattningRad } from './klarTrakt';

export interface SignaturIndata {
  /** Planeringens markeringar (symboler, linjer, ytor, pilar). */
  markers: ReadonlyArray<{ id: string | number; type?: string | null; lineType?: string | null; zoneType?: string | null; comment?: string | null; photoPath?: string | null }>;
  /** Kartkommentarernas id:n (de skrivna kommentarerna). */
  kommentarIds: readonly string[];
  /** Vidas direktiv och planerarens text. */
  texter: readonly string[];
  /** Det som avviker inför jobbet (band, ved …). */
  infor: readonly SammanfattningRad[];
}

const kort = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

/** En signatur per sak som kan vara ny. Samma innehåll ger samma signatur; ändras en kommentar eller ett foto blir det en ny. */
export function markeringSignatur(m: SignaturIndata['markers'][number]): string {
  const typ = m.type ?? m.lineType ?? m.zoneType ?? '';
  return `m:${m.id}:${kort(`${typ}|${String(m.comment ?? '').trim()}|${m.photoPath ?? ''}`)}`;
}

export function signaturer(i: SignaturIndata): string[] {
  const ut: string[] = [];
  for (const m of i.markers) ut.push(markeringSignatur(m));
  for (const k of i.kommentarIds) ut.push(`k:${k}`);
  for (const t of i.texter) if (t.trim()) ut.push(`t:${kort(t.trim())}`);
  for (const r of i.infor) ut.push(`i:${r.id}:${kort(r.text)}`);
  return ut.sort();
}

// ── Enhetens minne ────────────────────────────────────────────────────────────────────────────────────────────────────
const NYCKEL = 'trakt_oversikt_sett_v1';
const nyckel = (maskinId: string, objektId: string) => `${NYCKEL}:${maskinId}:${objektId}`;

/** Vad maskinen har sett av trakten. null = aldrig sett (eller minnet går inte att läsa) — då visas överblicken. */
export function lasSett(maskinId: string, objektId: string, lager: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): Set<string> | null {
  try {
    const r = lager?.getItem(nyckel(maskinId, objektId));
    if (!r) return null;
    const a = JSON.parse(r);
    return Array.isArray(a) ? new Set(a.filter((x) => typeof x === 'string')) : null;
  } catch { return null; }
}

export function sparaSett(maskinId: string, objektId: string, sig: readonly string[], lager: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  try { lager?.setItem(nyckel(maskinId, objektId), JSON.stringify([...sig])); } catch { /* privat läge: visas igen nästa gång */ }
}

/** Ska överblicken visas av sig själv? Aldrig sett, eller något nytt sedan sist. Något som tagits bort räknas inte. */
export function behoverVisas(sett: ReadonlySet<string> | null, sig: readonly string[]): boolean {
  if (!sett) return true;
  return sig.some((s) => !sett.has(s));
}

/** Markeringarna som är nya sedan maskinen såg trakten (tom när den aldrig setts — då är allt "nytt" och inget märks). */
export function nyaMarkeringar(sett: ReadonlySet<string> | null, markers: SignaturIndata['markers'], kommentarer: ReadonlyArray<{ id: string; nyckel: string }> = []): Set<string> {
  const ut = new Set<string>();
  if (!sett) return ut;
  for (const m of markers) if (!sett.has(markeringSignatur(m))) ut.add(String(m.id));
  for (const k of kommentarer) if (!sett.has(`k:${k.id}`) && k.nyckel.startsWith('marker:')) ut.add(k.nyckel.slice('marker:'.length));
  return ut;
}

export const textNy = (sett: ReadonlySet<string> | null, text: string): boolean => !!sett && !!text.trim() && !sett.has(`t:${kort(text.trim())}`);

// ── Vad som visas ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Inför jobbet = bara det som AVVIKER (Martin: "inget om det är normalt"). Avlägg, basväg, terräng och avstånd är inga avvikelser. */
const AVVIKER = new Set(['band-skordare', 'band-skotare', 'manuell', 'ved', 'ris', 'breddat', 'vagn', 'trailer', 'avlagg-hugga', 'basvagsanlaggning', 'konfiguration']);
export function inforJobbet(rader: readonly SammanfattningRad[]): SammanfattningRad[] {
  return rader.filter((r) => AVVIKER.has(r.id) || (r.id === 'barighet' && r.text !== 'Bra'));
}

/** "Slutavverkning · PEFC · 2,5 ha" — bara det som finns. */
export function oversiktUnder(typ: string | null, cert: readonly string[], arealHa: number | null): string {
  const delar = [typ?.trim() || null, cert.length ? cert.join(' och ') : null, arealHa != null && arealHa > 0 ? `${arealHa.toFixed(1).replace('.', ',')} ha` : null];
  return delar.filter(Boolean).join(' · ');
}

const st = (n: number, en: string, flera: string) => `${n} ${n === 1 ? en : flera}`;

/** EN mening överst: "2 faror · 3 saker inför jobbet · 24 saker på kartan, 5 med text". */
export function oversiktMening(i: { faror: number; infor: number; paKartan: number; medText: number }): string {
  const d: string[] = [];
  d.push(i.faror > 0 ? st(i.faror, 'fara', 'faror') : 'Inga faror');
  if (i.infor > 0) d.push(`${st(i.infor, 'sak', 'saker')} inför jobbet`);
  if (i.paKartan > 0) d.push(`${st(i.paKartan, 'sak', 'saker')} på kartan${i.medText > 0 ? `, ${i.medText} med text` : ''}`);
  return d.join(' · ');
}
