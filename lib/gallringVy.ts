// Gallringsvyns uppdelning och ord — rena funktioner, inga anrop.
//
// lib/gallring.ts definierar talen (volym, stammar, Dgv). Den här filen bestämmer
// bara hur de grupperas och skrivs i vyn: pågår eller klar, vilken månad, vilken
// sortimentgrupp. Ligger separat så att den går att testa utan databasklient.

import { SORTIMENTFARG } from '@/lib/design/tokens';
import type { GallringRad, SortimentAndel } from '@/lib/gallring';

const MAN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MAN_LANG = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Pågår eller klar
// ---------------------------------------------------------------------------

/** En trakt pågår så länge maskinen inte rapporterat något slutdatum för
 *  skördningen (dim_objekt.skordning_avslutad). Samma fält som grindar kvittot —
 *  så "Pågår" i listan och "kvitto när skördningen är klar" i trakten säger
 *  alltid samma sak. */
export function pagar(rad: Pick<GallringRad, 'skordningAvslutad'>): boolean {
  return !rad.skordningAvslutad;
}

export type Manadsgrupp = { nyckel: string; rubrik: string; rader: GallringRad[] };

/** Listans delar: pågående överst, sedan de klara per månad för sista uttaget,
 *  senaste först. En lång lista blir sökbar på månad i stället för att läsas
 *  rad för rad. Tomma delar finns inte (ingen tom "Pågår"-sektion). */
export function delaUppLista(rader: GallringRad[]): { pagaende: GallringRad[]; manader: Manadsgrupp[] } {
  const pagaende = rader.filter(pagar);
  const manader: Manadsgrupp[] = [];
  for (const r of rader) {
    if (pagar(r)) continue;
    const nyckel = (r.sistaDatum ?? '').slice(0, 7) || 'okant';
    let g = manader.find((m) => m.nyckel === nyckel);
    if (!g) {
      const man = Number(nyckel.slice(5, 7));
      g = { nyckel, rubrik: MAN_LANG[man - 1] ?? 'Datum saknas', rader: [] };
      manader.push(g);
    }
    g.rader.push(r);
  }
  return { pagaende, manader };
}

// ---------------------------------------------------------------------------
// Datum, som man säger dem
// ---------------------------------------------------------------------------

function delar(iso: string): { ar: number; man: number; dag: number } {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { ar: a, man: m, dag: d };
}

/** "12 okt" — utan år. Listan visar ett år, året står i rubriken. */
export function dagMan(iso: string | null): string {
  if (!iso) return '—';
  const { man, dag } = delar(iso);
  return `${dag} ${MAN_KORT[man - 1] ?? '?'}`;
}

/** "12–20 okt", "28 sep – 3 okt" eller "12 okt". Samma månad skrivs en gång. */
export function kortSpann(rad: Pick<GallringRad, 'forstaDatum' | 'sistaDatum'>): string {
  const { forstaDatum: f, sistaDatum: s } = rad;
  if (!f || !s) return 'Datum saknas';
  if (f === s) return dagMan(f);
  const a = delar(f);
  const b = delar(s);
  if (a.ar === b.ar && a.man === b.man) return `${a.dag}–${b.dag} ${MAN_KORT[b.man - 1]}`;
  return `${dagMan(f)} – ${dagMan(s)}`;
}

/** "idag", "igår" eller "20 okt" — för pågående trakter, där det som räknas
 *  är hur nyligen maskinen körde. `idag` är lokal ISO-dag (YYYY-MM-DD). */
export function senast(iso: string | null, idag: string): string {
  if (!iso) return '—';
  if (iso.slice(0, 10) === idag) return 'idag';
  const t = new Date(`${idag}T12:00:00`);
  t.setDate(t.getDate() - 1);
  const igar = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  if (iso.slice(0, 10) === igar) return 'igår';
  return dagMan(iso);
}

/** Lokal dag som ISO. Aldrig toISOString() — den är UTC och byter dag vid midnatt fel. */
export function idagIso(nu = new Date()): string {
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`;
}

export function dagarText(n: number): string {
  return `${n} ${n === 1 ? 'dag' : 'dagar'}`;
}

// ---------------------------------------------------------------------------
// Sortiment → fyra grupper
// ---------------------------------------------------------------------------

// Maskinens sortimentnamn är "Grupp: kod" ("Massa: BmavFall_V3", "Kubb: Alvesta275_V3")
// och grupperna stavas olika mellan maskiner och köpare (prod 2026-10-22, gallring):
// Massa/Massaved, Kubb/kubb/JGA Kubb, Timmer/Tall Timmer/Talltimmer/Klentimmer,
// Övrigt Sågbart, Energi, Unspecified, Unclassified. Föraren behöver inte koden —
// han behöver veta vad virket blev. Samma fyra grupper och samma ljushetsskala som
// markägarrapporten (SORTIMENTFARG: mörkast = mest värt).

export type SortimentNyckel = keyof typeof SORTIMENTFARG;

const GRUPPER: { nyckel: SortimentNyckel; namn: string }[] = [
  { nyckel: 'timmer', namn: 'Timmer' },
  { nyckel: 'kubb', namn: 'Kubb' },
  { nyckel: 'massa', namn: 'Massaved' },
  { nyckel: 'ovrigt', namn: 'Övrigt' },
];

/** Vilken av de fyra grupperna ett sortiment hör till. Läser gruppen om den
 *  finns, annars hela namnet ("JGA Kubb" saknar kolon). */
export function sortimentNyckel(s: Pick<SortimentAndel, 'grupp' | 'namn'>): SortimentNyckel {
  const t = (s.grupp ?? s.namn).toLowerCase();
  if (t.includes('timmer')) return 'timmer';
  if (t.includes('kubb') || t.includes('sågbar')) return 'kubb';
  if (t.includes('massa')) return 'massa';
  return 'ovrigt';
}

export type Sortimentgrupp = {
  nyckel: SortimentNyckel;
  namn: string;
  farg: string;
  volym: number;
  stockar: number;
};

/** Grupperna i ordning mest värt först. Grupper utan volym tas bort. */
export function sortimentGrupper(sortiment: SortimentAndel[]): Sortimentgrupp[] {
  return GRUPPER.map((g) => {
    const mina = sortiment.filter((s) => sortimentNyckel(s) === g.nyckel);
    return {
      ...g,
      farg: SORTIMENTFARG[g.nyckel],
      volym: mina.reduce((sum, s) => sum + s.volym, 0),
      stockar: mina.reduce((sum, s) => sum + s.stockar, 0),
    };
  }).filter((g) => g.volym > 0);
}

/** Heltalsprocent som summerar till 100 (största resten får det som fattas),
 *  så att raderna går att kontrollräkna. */
export function procentSomSummerar(varden: number[]): number[] {
  const tot = varden.reduce((s, v) => s + v, 0);
  if (tot <= 0) return varden.map(() => 0);
  const raa = varden.map((v) => (v / tot) * 100);
  const golv = raa.map(Math.floor);
  let kvar = 100 - golv.reduce((s, v) => s + v, 0);
  const ordning = raa.map((v, i) => [v - golv[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordning) {
    if (kvar <= 0) break;
    golv[i]++;
    kvar--;
  }
  return golv;
}

const VECKODAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

/** "mån 12 okt" — dagraderna i en trakt. Räknas på kalenderdagen, aldrig via UTC. */
export function veckodagDag(iso: string): string {
  const { ar, man, dag } = delar(iso);
  const vd = new Date(ar, man - 1, dag).getDay();
  return `${VECKODAG[vd]} ${dag} ${MAN_KORT[man - 1] ?? '?'}`;
}

/** Datumspannet i en trakt: utan år när trakten ligger i innevarande år, annars med. */
export function traktSpann(rad: Pick<GallringRad, 'forstaDatum' | 'sistaDatum'>, iAr: number): string {
  const s = kortSpann(rad);
  const ar = rad.sistaDatum ? Number(rad.sistaDatum.slice(0, 4)) : iAr;
  return ar === iAr ? s : `${s} ${ar}`;
}
