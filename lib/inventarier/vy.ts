// Inventarievyns regler — rena funktioner, testade i vy.test.ts. Skärmen räknar aldrig själv: den frågar härifrån.
//
// Två frågor och inget annat:
//   1. Vad behöver beställas?  Förbrukning under minnivån (sågkedjor, olja).
//   2. Var finns grejen?       Sök över alla platser (mutterknackaren, slangen till hjularmen).

import type { Artikel, Inventarier, InvRad, Maskin, Plats, PlatsTyp, VisadRad } from './typer';

// ---------------------------------------------------------------------------
// Uppslag
// ---------------------------------------------------------------------------

/** Varje rad med sin artikel, plats och maskin. Rader vars artikel eller plats är inaktiv eller saknas tas inte med. */
export function visadeRader(inv: Inventarier): VisadRad[] {
  const art = new Map(inv.artiklar.map(a => [a.id, a]));
  const pla = new Map(inv.platser.map(p => [p.id, p]));
  const mas = new Map(inv.maskiner.map(m => [m.maskin_id, m]));
  const ut: VisadRad[] = [];
  for (const rad of inv.rader) {
    const artikel = art.get(rad.artikel_id);
    const plats = pla.get(rad.plats_id);
    if (!artikel || !plats || !artikel.aktiv || !plats.aktiv) continue;
    ut.push({ rad, artikel, plats, maskin: artikel.maskin_id ? mas.get(artikel.maskin_id) ?? null : null });
  }
  return ut;
}

export function maskinNamn(m: Maskin | null | undefined): string | null {
  if (!m) return null;
  return m.visningsnamn?.trim() || m.maskin_id;
}

// ---------------------------------------------------------------------------
// Texter
// ---------------------------------------------------------------------------

/** "Hydraulslang · Hjularm vänster" — sitter på följer namnet, aldrig tvärtom. */
export function artikelTitel(a: Pick<Artikel, 'namn' | 'sitter_pa'>): string {
  const sitter = a.sitter_pa?.trim();
  return sitter ? `${a.namn} · ${sitter}` : a.namn;
}

/** "Maskinhallen · hylla 3". Hyllan skrivs med litet h oavsett hur den skrevs in, om den bara är ett nummer. */
export function platsText(plats: Pick<Plats, 'namn'>, hylla: string | null): string {
  const h = hylla?.trim();
  if (!h) return plats.namn;
  return /^\d+[a-zA-ZåäöÅÄÖ]?$/.test(h) ? `${plats.namn} · hylla ${h}` : `${plats.namn} · ${h}`;
}

/** Raden under titeln: "Wisent · Maskinhallen · hylla 3". Utan maskin bara platsen. */
export function underText(v: VisadRad): string {
  const m = maskinNamn(v.maskin);
  const p = platsText(v.plats, v.rad.hylla);
  return m ? `${m} · ${p}` : p;
}

/** Antal med enhet: "5", "5 dunk". "st" skrivs aldrig ut — det är standard. */
export function antalText(antal: number, enhet: string | null | undefined): string {
  const e = enhet?.trim();
  return e && e !== 'st' ? `${antal} ${e}` : `${antal}`;
}

const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "14 okt", eller "14 okt 2025" när det inte är i år. Svensk tid. */
export function datumKort(iso: string, nu: Date = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const delar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(d);
  const v = (t: string) => Number(delar.find(x => x.type === t)?.value);
  const arNu = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric' }).format(nu));
  const bas = `${v('day')} ${MANADER[v('month') - 1]}`;
  return v('year') === arNu ? bas : `${bas} ${v('year')}`;
}

/** En lista är gammal efter så här många dagar. Då står "Senast kollad" i orange — texten säger det, färgen förstärker. */
export const GAMMAL_LISTA_DAGAR = 60;

export type KolladText = { text: string; gammal: boolean };

/** "Senast kollad 14 okt" / "Aldrig kollad". `av` läggs till när namnet går att läsa. */
export function kolladText(plats: Pick<Plats, 'senast_kollad'>, av: string | null = null, nu: Date = new Date()): KolladText {
  if (!plats.senast_kollad) return { text: 'Aldrig kollad', gammal: true };
  const t = Date.parse(plats.senast_kollad);
  const dagar = (nu.getTime() - t) / 86_400_000;
  const vem = av ? ` av ${fornamn(av)}` : '';
  return { text: `Senast kollad ${datumKort(plats.senast_kollad, nu)}${vem}`, gammal: dagar > GAMMAL_LISTA_DAGAR };
}

export function fornamn(namn: string): string {
  return namn.trim().split(/\s+/)[0] ?? namn;
}

// ---------------------------------------------------------------------------
// 1. Att beställa
// ---------------------------------------------------------------------------

/** Förbrukning under minnivån — samma villkor som vyn vy_inventarie_att_bestalla. */
export function arUnderMin(rad: Pick<InvRad, 'antal' | 'min_antal'>, artikel: Pick<Artikel, 'typ'>): boolean {
  return artikel.typ === 'forbrukning' && rad.antal != null && rad.min_antal != null && rad.antal < rad.min_antal;
}

/** Ej beställda först, och bland dem det som ligger längst under min. Beställda sist, äldst beställning först. */
export function attBestalla(rader: VisadRad[]): VisadRad[] {
  return rader
    .filter(v => arUnderMin(v.rad, v.artikel))
    .sort((a, b) => {
      const ab = a.rad.bestalld_tid ? 1 : 0;
      const bb = b.rad.bestalld_tid ? 1 : 0;
      if (ab !== bb) return ab - bb;
      if (ab === 1) return (a.rad.bestalld_tid ?? '').localeCompare(b.rad.bestalld_tid ?? '');
      const ua = (a.rad.min_antal ?? 0) - (a.rad.antal ?? 0);
      const ub = (b.rad.min_antal ?? 0) - (b.rad.antal ?? 0);
      return ub - ua || artikelTitel(a.artikel).localeCompare(artikelTitel(b.artikel), 'sv');
    });
}

/** Talet överst: bara det som INTE redan är beställt. */
export function antalAttBestalla(rader: VisadRad[]): number {
  return attBestalla(rader).filter(v => !v.rad.bestalld_tid).length;
}

/** Förifyllt antal i Kommit in: upp till minnivån, minst 1. */
export function forslagKommitIn(rad: Pick<InvRad, 'antal' | 'min_antal'>): number {
  return Math.max(1, (rad.min_antal ?? 0) - (rad.antal ?? 0));
}

// ---------------------------------------------------------------------------
// 2. Var finns det?
// ---------------------------------------------------------------------------

function normalisera(s: string): string {
  return s.toLocaleLowerCase('sv-SE').normalize('NFC');
}

/**
 * Sök: ALLA ord måste träffa någonstans i artikelns namn, artikelnummer, "sitter på" eller maskinens namn.
 * "wisent hjularm" hittar slangen till Wisents hjularm, men inte en slang till Giants hjularm.
 */
export function sok(rader: VisadRad[], fraga: string): VisadRad[] {
  const ord = normalisera(fraga).split(/\s+/).filter(Boolean);
  if (ord.length === 0) return [];
  return rader
    .filter(v => {
      const hos = normalisera([
        v.artikel.namn, v.artikel.artikelnr ?? '', v.artikel.sitter_pa ?? '', maskinNamn(v.maskin) ?? '',
      ].join(' '));
      return ord.every(o => hos.includes(o));
    })
    .sort((a, b) => artikelTitel(a.artikel).localeCompare(artikelTitel(b.artikel), 'sv') || a.plats.namn.localeCompare(b.plats.namn, 'sv'));
}

// ---------------------------------------------------------------------------
// Platser
// ---------------------------------------------------------------------------

export type PlatsGrupp = { rubrik: string; platser: Plats[] };

const GRUPP_RUBRIK: Record<PlatsTyp, string> = { hall: 'Maskinhallen', verkstad: 'Verkstad', bil: 'Bilar', skap: 'Depåskåp' };

/**
 * Hall och verkstad först (i sin ordning), sedan Bilar med den inloggades bil först, sist Depåskåp.
 * En tom grupp visas inte.
 */
export function platsGrupper(platser: Plats[], minId: string | null): PlatsGrupp[] {
  const aktiva = platser.filter(p => p.aktiv);
  const efterNamn = (a: Plats, b: Plats) => a.ordning - b.ordning || a.namn.localeCompare(b.namn, 'sv');
  const fasta = aktiva.filter(p => p.typ === 'hall' || p.typ === 'verkstad').sort(efterNamn);
  const bilar = aktiva.filter(p => p.typ === 'bil').sort((a, b) => {
    const am = minId && a.ansvarig_medarbetare_id === minId ? 0 : 1;
    const bm = minId && b.ansvarig_medarbetare_id === minId ? 0 : 1;
    return am - bm || efterNamn(a, b);
  });
  const skap = aktiva.filter(p => p.typ === 'skap').sort(efterNamn);
  const ut: PlatsGrupp[] = [];
  if (fasta.length) ut.push({ rubrik: 'Hall och verkstad', platser: fasta });
  if (bilar.length) ut.push({ rubrik: GRUPP_RUBRIK.bil, platser: bilar });
  if (skap.length) ut.push({ rubrik: GRUPP_RUBRIK.skap, platser: skap });
  return ut;
}

/** Rubriken över en platslista utan hyllor: "I bilen", "I skåpet", "I hallen", "På verkstaden". */
export function platsListRubrik(typ: PlatsTyp): string {
  return typ === 'bil' ? 'I bilen' : typ === 'skap' ? 'I skåpet' : typ === 'verkstad' ? 'På verkstaden' : 'I hallen';
}

export type HyllGrupp = { rubrik: string; rader: VisadRad[] };

/** En plats rader, sorterade på namn och grupperade på hylla när någon rad har hylla. Rader utan hylla samlas sist. */
export function hyllGrupper(rader: VisadRad[], typ: PlatsTyp): HyllGrupp[] {
  const sorterade = [...rader].sort((a, b) => artikelTitel(a.artikel).localeCompare(artikelTitel(b.artikel), 'sv'));
  if (!sorterade.some(v => v.rad.hylla?.trim())) return sorterade.length ? [{ rubrik: platsListRubrik(typ), rader: sorterade }] : [];
  const map = new Map<string, VisadRad[]>();
  for (const v of sorterade) {
    const h = v.rad.hylla?.trim() ?? '';
    map.set(h, [...(map.get(h) ?? []), v]);
  }
  const namngivna = Array.from(map.keys()).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'sv', { numeric: true }));
  const ut: HyllGrupp[] = namngivna.map(h => ({ rubrik: /^\d+[a-zA-ZåäöÅÄÖ]?$/.test(h) ? `Hylla ${h}` : h, rader: map.get(h)! }));
  if (map.has('')) ut.push({ rubrik: 'Utan hylla', rader: map.get('')! });
  return ut;
}

/** Tomt läge i en plats: varför listan är tom och vad som fyller den. */
export function tomText(plats: Pick<Plats, 'namn' | 'typ'>): string {
  if (plats.typ === 'bil') return `Inget registrerat i ${plats.namn}. Lägg till det som ligger där, så slipper någon ringa och fråga.`;
  if (plats.typ === 'skap') return `Inget registrerat i ${plats.namn}. Lägg till det som ligger i skåpet.`;
  return `Inget registrerat i ${plats.namn} än. Lägg till förbrukningen här, så säger appen till när den börjar ta slut.`;
}

// ---------------------------------------------------------------------------
// Lägg till
// ---------------------------------------------------------------------------

/** Befintliga artiklar som matchar det man skriver — så samma sak inte läggs upp två gånger. Högst `max`. */
export function artikelForslag(artiklar: Artikel[], fraga: string, max = 5): Artikel[] {
  const f = normalisera(fraga.trim());
  if (f.length < 2) return [];
  return artiklar
    .filter(a => a.aktiv && normalisera(artikelTitel(a)).includes(f))
    .sort((a, b) => {
      const as = normalisera(a.namn).startsWith(f) ? 0 : 1;
      const bs = normalisera(b.namn).startsWith(f) ? 0 : 1;
      return as - bs || artikelTitel(a).localeCompare(artikelTitel(b), 'sv');
    })
    .slice(0, max);
}

/** Tidigare "sitter på" för SAMMA maskin, så stavningen hålls ihop ("Hjularm vänster", inte "hjularmen"). */
export function sitterPaForslag(artiklar: Artikel[], maskinId: string | null, fraga: string, max = 5): string[] {
  const f = normalisera(fraga.trim());
  const sett = new Map<string, string>();
  for (const a of artiklar) {
    if (!a.aktiv || a.maskin_id !== maskinId) continue;
    const s = a.sitter_pa?.trim();
    if (!s) continue;
    const n = normalisera(s);
    if (f && (!n.includes(f) || n === f)) continue;
    if (!sett.has(n)) sett.set(n, s);
  }
  return Array.from(sett.values()).sort((a, b) => a.localeCompare(b, 'sv')).slice(0, max);
}

/** Ett heltal ≥ 0 ur ett fält, eller null när fältet är tomt eller inte ett heltal. */
export function heltal(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
