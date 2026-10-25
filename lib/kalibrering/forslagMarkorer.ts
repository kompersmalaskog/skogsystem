/**
 * MARKÖRERNA SOM STYR JUSTERINGSFÖRSLAGEN — vad som gjorts i maskinen, och när.
 *
 * Förslagen räknas på stammar klavade EFTER den senaste ändringen: en ändring (tryck, kurva, nya knivar) gör äldre stammar inaktuella. Den här filen
 * vet vilka markörer som är ändringar och hur appens egna markörer skrivs och läses. Förarens åtgärder (kalibrering_atgard) är fri text, så appens
 * knappar skriver en fast form som går att läsa tillbaka:
 *
 *   Kurvan ändrad: Tall 200 mm −3 mm          ("Jag har ändrat" på ett Ändra-steg, en markör per punkt)
 *   Höjt trycket på knivar och hjul           (tryckändring — samma ord som förarna redan skriver)
 *   Bytt knivar eller valsar                  ("Bytte något" på ett Kolla-steg)
 *   Kollat knivar och valsar – allt såg bra ut ("Klart, allt såg bra ut": ingen ändring, bara ett svar)
 *
 * Allt annat förarna skriver ("Nya band", "Bytt hydraulolja") är en markör men ingen ändring som flyttar fönstret.
 *
 * TVÅ SORTERS ÄNDRINGAR, olika dag-regel (`samtidig`):
 *  - En åtgärd i appen görs FÖRE förarna klavar för att se om den hjälpte, så stammar klavade samma dag räknas EFTER ändringen.
 *  - En kalibrering ur historiken (fakt_kalibrering_historik) är RESULTATET av en klavning samma dag — stammarna som mättes den dagen ledde till
 *    justeringen — så samma dag räknas FÖRE ändringen och fönstret börjar dagen efter.
 */
import { tradslagLabel } from '@/lib/tradslag';
import { kalibreringsSlag, type HistorikMarkorRad } from './historik';
import type { GrovlekKlass } from './grovlek';

export const TRYCK_TEXT = 'Höjt trycket på knivar och hjul';
export const BYTE_TEXT = 'Bytt knivar eller valsar';
export const KONTROLL_TEXT = 'Kollat knivar och valsar – allt såg bra ut';

/** De fem punkterna på kurvan, som förarna läser dem: 100, 150, 200, 250, 300+ mm (klassen börjar där; "100" är allt under 150). */
export const PUNKTER: { klass: GrovlekKlass; punkt: string; fran: number; till: number | null }[] = [
  { klass: '<150', punkt: '100', fran: 0, till: 149 },
  { klass: '150-199', punkt: '150', fran: 150, till: 199 },
  { klass: '200-249', punkt: '200', fran: 200, till: 249 },
  { klass: '250-299', punkt: '250', fran: 250, till: 299 },
  { klass: '300+', punkt: '300+', fran: 300, till: null },
];
export const punktAv = (klass: GrovlekKlass): string => PUNKTER.find(p => p.klass === klass)?.punkt ?? klass;
export const klassAv = (punkt: string): GrovlekKlass | null => PUNKTER.find(p => p.punkt === punkt)?.klass ?? null;

const tecken = (mm: number): string => (mm > 0 ? `+${mm}` : mm < 0 ? `−${Math.abs(mm)}` : '0');
/** "−3", "+2" — minustecknet som det skrivs för hand i appen. */
export const mmMedTecken = tecken;

export const kurvaText = (tradslag: string, punkt: string, mm: number): string => `Kurvan ändrad: ${tradslagLabel(tradslag)} ${punkt} mm ${tecken(mm)} mm`;

export type MarkorTolkning =
  | { slag: 'kurva'; tradslag: string; klass: GrovlekKlass; mm: number }
  | { slag: 'tryck' | 'byte' | 'kontroll' | 'annan' };

const KURVA = /^Kurvan ändrad: (.+?) (100|150|200|250|300\+) mm ([+−-]?\d+) mm$/;

export function tolkaMarkor(text: string): MarkorTolkning {
  const t = text.trim();
  const k = KURVA.exec(t);
  if (k) {
    const klass = klassAv(k[2]);
    const mm = Number(k[3].replace('−', '-'));
    if (klass && Number.isFinite(mm)) return { slag: 'kurva', tradslag: tradslagLabel(k[1]), klass, mm };
  }
  if (t === KONTROLL_TEXT) return { slag: 'kontroll' };
  if (t === BYTE_TEXT) return { slag: 'byte' };
  if (/tryck/i.test(t)) return { slag: 'tryck' };
  return { slag: 'annan' };
}

/** Vad som ändrat maskinens mätning och därmed gör äldre stammar inaktuella. */
export type Andring = {
  datum: string;
  slag: 'tryck' | 'byte' | 'omkalibrering' | 'kurva' | 'kalibrering';
  /** null = hela maskinen. */
  tradslag: string | null;
  /** null = alla grovlekar av trädslaget. */
  klass: GrovlekKlass | null;
  /** true = stammar klavade samma dag räknas efter ändringen (en åtgärd i appen); false = före (resultatet av en klavning). */
  samtidig: boolean;
};

export type AtgardRad = { datum: string; text: string };
export type HistorikRad = HistorikMarkorRad;

const dag = (s: string): string => String(s).slice(0, 10);

/**
 * Ändringarna för en maskin, ur förarens åtgärder och kalibreringshistoriken.
 *
 * Historiken: en omkalibrering efter reparation ändrar hela maskinen. En diameterkalibrering med ett värde skilt från noll är en riktig ändring av
 * trädslagets kurva (klassen går inte att säga — en enda justeringspunkt per block); en med noll är en kalibrering utan justering och flyttar ingenting.
 * Längdkalibreringar rör inte diametern.
 */
export function andringarUr(args: { atgarder: AtgardRad[]; historik: HistorikRad[] }): Andring[] {
  const ut: Andring[] = [];
  for (const a of args.atgarder) {
    const t = tolkaMarkor(a.text);
    if (t.slag === 'tryck' || t.slag === 'byte') ut.push({ datum: dag(a.datum), slag: t.slag, tradslag: null, klass: null, samtidig: true });
    else if (t.slag === 'kurva') ut.push({ datum: dag(a.datum), slag: 'kurva', tradslag: t.tradslag, klass: t.klass, samtidig: true });
  }
  for (const h of args.historik) {
    const slag = kalibreringsSlag(h);
    if (slag === 'omkalibrering') ut.push({ datum: dag(h.datum), slag: 'omkalibrering', tradslag: null, klass: null, samtidig: false });
    else if (slag === 'diameter') ut.push({ datum: dag(h.datum), slag: 'kalibrering', tradslag: tradslagLabel(h.tradslag), klass: null, samtidig: false });
  }
  return ut.sort((a, b) => a.datum.localeCompare(b.datum));
}

const plusDagar = (datum: string, n: number): string => new Date(new Date(`${datum}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/** Första dagen vars stammar räknas efter ändringen. */
export const forstaDagEfter = (a: Andring): string => (a.samtidig ? a.datum : plusDagar(a.datum, 1));

/** Gäller ändringen den här punkten (trädslag + grovlek)? */
export const galler = (a: Andring, tradslag: string, klass: GrovlekKlass): boolean =>
  (a.tradslag == null || a.tradslag === tradslag) && (a.klass == null || a.klass === klass);

/** Vilka ändringar som är en tryckändring eller ett byte — de gäller hela maskinen och styr veckans väntan. */
export const senasteTryck = (andringar: Andring[]): Andring | null =>
  andringar.filter(a => a.slag === 'tryck' || a.slag === 'byte').sort((a, b) => b.datum.localeCompare(a.datum))[0] ?? null;

