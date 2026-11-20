// All text om en runda — rad i listan och ark delar den, så samma runda säger samma sak överallt.
// Ordet bär alltid betydelsen; färgen förstärker bara (skillen: färg är aldrig ensam bärare).

import { fmtDatum, fmtDatumLang, fmtKlocka } from './nu';
import type { Ben, Runda } from './rundor';

export type Farg = 'orange' | 'gron' | 'dampad';
export interface Markning { text: string; farg: Farg }

/** "Giant", "Elefant 26 + Wisent", "Övrig körning", "Tom runda". */
export function rundaRubrik(r: Runda): string {
  if (r.flytt) return r.ben.map(b => b.maskin).join(' + ');
  if (r.avbruten) return 'Avbruten runda';
  if (r.tom) return 'Tom runda';
  return 'Övrig körning';
}

/** "mån 12 okt · 11:30" (svensk tid). En runda utan giltig tid säger det. */
export function rundaTidRad(r: Runda): string {
  const kl = r.giltig || r.pagar ? fmtKlocka(r.start) : 'okänd tid';
  return `${fmtDatum(r.start)} · ${kl}`;
}

/** "A", "A och B", "A, B och C" — samma maskin två gånger står en gång. */
function uppraknat(namn: string[]): string {
  const unika = namn.filter((n, i) => namn.indexOf(n) === i);
  return unika.length <= 1 ? (unika[0] ?? '') : `${unika.slice(0, -1).join(', ')} och ${unika[unika.length - 1]}`;
}

/**
 * Rundradens första rad — vad som hände, i ord: "Wisent till LBC", "Elefant 26, 810E och Wisent", "Övrig körning".
 * En flytt utan känt mål säger "till okänd plats".
 */
export function rundaRadTitel(r: Runda): string {
  if (r.flytt) {
    if (r.ben.length === 1) return `${r.ben[0].maskin} till ${r.ben[0].till ?? 'okänd plats'}`;
    return uppraknat(r.ben.map(b => b.maskin));
  }
  return rundaRubrik(r);
}

/** Rundradens andra rad — när och varifrån: "torsdag 22 okt · från Vällust", "måndag 12 okt · 3 flyttar". Klockslaget står i arket. */
export function rundaRadUnder(r: Runda): string {
  const delar = [fmtDatumLang(r.start)];
  if (r.flytt) {
    if (r.ben.length === 1) { if (r.ben[0].fran) delar.push(`från ${r.ben[0].fran}`); }
    else delar.push(`${r.ben.length} flyttar`);
  } else if (r.avbruten) delar.push(r.forare ? `${r.forare} avbröt` : 'avbröts');
  else if (r.tom) delar.push('bilen rörde sig aldrig');
  return delar.join(' · ');
}

export function rundaMarkningar(r: Runda): Markning[] {
  const m: Markning[] = [];
  if (r.pagar) m.push({ text: 'Pågår, räknas när den avslutats', farg: 'orange' });
  if (r.avbruten) m.push({ text: 'Avbruten, räknas inte', farg: 'dampad' });
  if (r.ogiltigTid) m.push({ text: 'Sluttid före start, räknas inte', farg: 'orange' });
  if (r.overlappar) m.push({ text: 'Överlappar en annan runda', farg: 'orange' });
  if (r.fortsattningEfter) m.push({ text: `Fortsättning efter ${fmtKlocka(r.fortsattningEfter)}`, farg: 'dampad' });
  return m;
}

/** Vad som står vid ett ben: fakturerbar, service, annat eller "Under 3 mil". */
export function benEtikett(b: Ben): Markning {
  if (b.fakturerbar) return { text: b.typ === 'kunduppdrag' ? 'Fakturerbar · kund' : 'Fakturerbar', farg: 'gron' };
  if (b.typ === 'service') return { text: 'Service', farg: 'dampad' };
  if (b.typ === 'annat') return { text: 'Annat', farg: 'dampad' };
  return { text: 'Under 3 mil', farg: 'dampad' };
}

/** Anmärkningar i arket, i den ordning de är viktiga. */
export function rundaAnmarkningar(r: Runda): Markning[] {
  const a: Markning[] = [];
  if (r.pagar) a.push({ text: 'Rundan pågår och räknas i summorna när den avslutats.', farg: 'orange' });
  if (r.avbruten) a.push({ text: 'Rundan avbröts av föraren och räknas inte i summorna.', farg: 'dampad' });
  if (r.ogiltigTid) a.push({ text: 'Sluttiden ligger före starttiden. Rundan räknas inte i summorna.', farg: 'orange' });
  if (r.overlappar) a.push({ text: 'Överlappar en annan runda i tid. Kilometer och diesel kan vara dubbelräknade.', farg: 'orange' });
  if (r.fortsattningEfter) a.push({ text: `Fortsättning av rundan som slutade ${fmtKlocka(r.fortsattningEfter)}. Bilen var fortfarande ute då, så mätare och diesel räknas från den tidpunkten.`, farg: 'dampad' });
  if (r.tom) a.push({ text: 'Rundan startades på basen och bilen rörde sig aldrig.', farg: 'dampad' });
  else if (!r.flytt && r.giltig) a.push({ text: 'Ingen flytt är kopplad till rundan och inget syfte är registrerat. Bilen kan ha kört något som ingen registrerade.', farg: 'dampad' });
  if (r.autoAv === 'cron_sakerhetsnat') a.push({ text: 'Stängdes automatiskt efter att "Kör hem" aldrig trycktes.', farg: 'orange' });
  return a;
}

export function fmtMinuter(min: number | null): string {
  if (min == null) return 'saknas i datan';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
