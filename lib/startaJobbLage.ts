// STARTA JOBB — ett P-VO:s LÄGE: ledigt, taget, startat utan data eller klart. Rena funktioner, testade i startaJobbLage.test.ts.
//
// Martins krav (2026-10-24): "man ser om ett VO är förbrukat/använt och det syns tydligt". Läget står i TEXT på varje rad och
// räknas aldrig ut av den som läser (skillen: tillstånd syns, det räknas aldrig ut).
//
//   klar        objektet avslutat                                           → raden dämpas, under "Klara"
//   tagen       någon maskin har skickat data på numret (maskinobjekt) eller → "Tagen · H8E -26 · sedan 23 okt"
//               loggat hyttspår på jobbet (JD810E skickar inga filer)
//   ingen_data  jobbet är startat (pågående) men ingen maskin har något      → orange: något gick snett vid inknappningen
//   ledig       inget av ovan                                               → "Ledig · inte inknappad i någon maskin"
//
// Maskindata hittas på ALLA vägar ett jobb kan få den (CLAUDE.md "Skördarens objekt för ett jobb utan Vida-nummer"):
// dim_objekt.vo_nummer = VO, objekt.dim_objekt_id, och extra nummer (objekt_alt_nummer → lib/objektNummer stamObjektId).
// Att bara titta på dim_objekt.vo_nummer missar t.ex. P-1023 (data under 880808 via dim_objekt_id).

import { stamObjektId, type AltNummer } from './objektNummer';
import type { JobbRoll } from './startaJobb';

export type VoLage = 'ledig' | 'tagen' | 'ingen_data' | 'klar';

export interface MaskinSpar {
  maskinId: string;
  namn: string;
  roll: JobbRoll | null;
  /** Första dagen maskinen har något på jobbet (ISO-datum eller tid). null = okänt. */
  forsta: string | null;
}

/** Vilka maskiner jobbet ska få data från. GROT och energiklippning: EN maskin. Egen skotning: bara skördaren. */
export type Forvantat = 'en_maskin' | 'bara_skordare' | 'skordare_och_skotare';

export function forvantat(typ: string | null | undefined, egenSkotning: boolean | null | undefined): Forvantat {
  const t = (typ || '').toLowerCase();
  if (t.includes('grot') || t.includes('energi')) return 'en_maskin';
  if (egenSkotning) return 'bara_skordare';
  return 'skordare_och_skotare';
}

/** Instruktionen under VO-numret. */
export function inknappningsText(f: Forvantat): string {
  if (f === 'en_maskin') return 'Knappa in numret i maskinen';
  if (f === 'bara_skordare') return 'Knappa in numret i skördaren';
  return 'Knappa in numret i båda maskinerna';
}

/** Kan jobbet ha egen skotning? Bara virkesjobb — GROT och energiklippning har ingen skotare att välja bort. */
export const kanHaEgenSkotning = (typ: string | null | undefined): boolean => forvantat(typ, false) === 'skordare_och_skotare';

const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** '2026-10-23…' → '23 okt'. Annat år än `idagAr` → '23 okt 2025'. Trasigt → null. */
export function kortDatum(iso: string | null | undefined, idagAr?: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return null;
  const ar = Number(m[1]), man = Number(m[2]), dag = Number(m[3]);
  if (man < 1 || man > 12 || dag < 1 || dag > 31) return null;
  return `${dag} ${MANAD[man - 1]}${idagAr != null && ar !== idagAr ? ` ${ar}` : ''}`;
}

/** Maskinerna sorterade: skördare före skotare, sedan tidigast först. En maskin står en gång (tidigaste datumet vinner). */
export function slaIhopMaskiner(lista: readonly MaskinSpar[]): MaskinSpar[] {
  const per = new Map<string, MaskinSpar>();
  for (const m of lista) {
    if (!m.maskinId) continue;
    const f = per.get(m.maskinId);
    if (!f) { per.set(m.maskinId, { ...m }); continue; }
    if (m.forsta && (!f.forsta || m.forsta < f.forsta)) f.forsta = m.forsta;
    if (!f.roll && m.roll) f.roll = m.roll;
  }
  const rang = (r: JobbRoll | null) => (r === 'skordare' ? 0 : r === 'skotare' ? 1 : 2);
  return Array.from(per.values()).sort((a, b) => rang(a.roll) - rang(b.roll) || String(a.forsta ?? '9').localeCompare(String(b.forsta ?? '9')));
}

export interface LageIndata {
  status: string | null | undefined;
  maskiner: readonly MaskinSpar[];
}

export function voLage(i: LageIndata): VoLage {
  if (i.status === 'avslutat') return 'klar';
  if (i.maskiner.length > 0) return 'tagen';
  if (i.status === 'pagaende' || i.status === 'skotning') return 'ingen_data';
  return 'ledig';
}

/** Raden under jobbets namn i listan. */
export function lageText(lage: VoLage, maskiner: readonly MaskinSpar[], idagAr?: number): string {
  if (lage === 'klar') return 'Klar';
  if (lage === 'ingen_data') return 'Startad — ingen maskin har skickat data';
  if (lage === 'ledig') return 'Ledig · inte inknappad i någon maskin';
  const ms = slaIhopMaskiner(maskiner);
  const namn = ms.map((m) => m.namn).join(' + ');
  const forsta = ms.map((m) => m.forsta).filter(Boolean).sort()[0] ?? null;
  const d = kortDatum(forsta, idagAr);
  return ['Tagen', namn, d ? `sedan ${d}` : null].filter(Boolean).join(' · ');
}

export type MaskinRadVy = { titel: string; under: string; saknas: boolean };

/** Raderna under "Maskiner" i jobbets vy: en per maskin som har data, och en rad för varje förväntad roll som saknas. */
export function maskinRader(f: Forvantat, maskiner: readonly MaskinSpar[], idagAr?: number): MaskinRadVy[] {
  const ms = slaIhopMaskiner(maskiner);
  const rollOrd = (r: JobbRoll | null) => (r === 'skordare' ? 'Skördare' : r === 'skotare' ? 'Skotare' : 'Maskin');
  const ut: MaskinRadVy[] = ms.map((m) => {
    const d = kortDatum(m.forsta, idagAr);
    return { titel: m.namn, under: [rollOrd(m.roll), d ? `första data ${d}` : null].filter(Boolean).join(' · '), saknas: false };
  });
  const har = (r: JobbRoll) => ms.some((m) => m.roll === r);
  if (f === 'en_maskin') {
    if (ms.length === 0) ut.push({ titel: 'Ingen maskin än', under: 'Ingen maskin har skickat data på numret', saknas: true });
    return ut;
  }
  if (!har('skordare')) ut.push({ titel: 'Skördare', under: 'Ingen skördare har skickat data än', saknas: true });
  if (f === 'bara_skordare') ut.push({ titel: 'Skotare', under: 'Egen skotning — inga filer väntas', saknas: false });
  else if (!har('skotare')) ut.push({ titel: 'Skotare', under: 'Ingen skotare har skickat data än', saknas: true });
  return ut;
}

// ── Insamling: vilka maskinobjekt (dim_objekt.objekt_id) hör till jobbet ──────────────────────────────────────────────

export interface JobbNycklar {
  vo: string;
  dimObjektId: string | null | undefined;
  alt: readonly AltNummer[];
}

/** Alla dim_objekt.objekt_id jobbets maskindata kan ligga under (utöver rader där dim_objekt.vo_nummer = VO). */
export function dimIdsForJobb(j: JobbNycklar): string[] {
  const ut = new Set<string>();
  if (j.dimObjektId) ut.add(String(j.dimObjektId));
  for (const a of j.alt) {
    if (!a?.nummer) continue;
    ut.add(stamObjektId(a));
    ut.add(a.nummer);   // kontraktsnummer kan också vara ett dim_objekt.objekt_id (Ponsse-objekt bär numret som id)
  }
  return Array.from(ut);
}
