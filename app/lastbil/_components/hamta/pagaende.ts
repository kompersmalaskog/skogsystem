// "Fortsätt hämta X" — ren logik för knappen som visar att en hämtning pågår. Läsningen ligger i usePagaendeHamtning.
//
// DATABASEN STYR: förarens öppna flytt (Lassat inom 12 h) betyder att en hämtning pågår. Utkastet på enheten används bara för att
// visa rätt steg och detaljer — och, när ingen flytt är öppen, för stegen Vart ska X? / Vägen hem (en lossad flytt är redan stängd).
// En öppen flytt äldre än 12 h öppnas ALDRIG automatiskt (varken här eller i flödet): den syns för admin som att göra och rättas där.

import type { Utkast } from './flode';
import { UTKAST_MAX_ALDER_MS } from './flode';

/** Förarens öppna flytt, som maskin_flytt har den. */
export interface OppenFlytt {
  id: string;
  maskin_id: string | null;
  extern_maskin: string | null;
  starttid: string;
  hamtad_tid: string | null;
}

export interface Pagaende {
  /** Vad som avgjorde: en öppen flytt i databasen, eller (utan öppen flytt) utkastet på enheten. */
  kalla: 'db' | 'utkast';
  /** Maskinens namn: "Fortsätt hämta Giant". */
  namn: string;
  /** Raden under knappen, i ord: "Lassat 12:30 · Vart ska den?". */
  rad: string;
  /** Utkastet beskriver samma hämtning (samma flytt) och får därför användas när flödet öppnas. Annars ska det rensas först. */
  behallUtkast: boolean;
}

/** När Lassat skedde. En flytt utan hamtad_tid räknas från starttid (som flödet själv gör när det tar upp en öppen flytt). */
export const lassatTid = (f: Pick<OppenFlytt, 'starttid' | 'hamtad_tid'>): string => f.hamtad_tid ?? f.starttid;

/** Gäller en öppen flytt? Inom 12 h från Lassat. Samma regel i knappen och i flödets återupptagning. */
export function oppenFlyttGaller(f: Pick<OppenFlytt, 'starttid' | 'hamtad_tid'>, nuMs: number): boolean {
  const t = Date.parse(lassatTid(f));
  return Number.isFinite(t) && nuMs - t <= UTKAST_MAX_ALDER_MS;
}

const klockslag = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export function harledPagaende(inp: {
  /** Utkastet på enheten (redan åldersprövat av `lasUtkast`), eller null. */
  utkast: Utkast | null;
  /** Förarens öppna flytt ur databasen, eller null. */
  flytt: OppenFlytt | null;
  /** Maskinens namn ur dim_maskin; null när det inte gick att slå upp. */
  namnFor: (maskinId: string) => string | null;
  nuMs: number;
}): Pagaende | null {
  const { utkast, flytt, namnFor, nuMs } = inp;

  if (flytt && oppenFlyttGaller(flytt, nuMs)) {
    const samma = !!utkast && utkast.flyttId === flytt.id;
    const namn = flytt.extern_maskin ?? (flytt.maskin_id ? namnFor(flytt.maskin_id) : null) ?? 'maskinen';
    const lassat = `Lassat ${klockslag(lassatTid(flytt))}`;
    // Steget ur utkastet när det hör till den här flytten; annars det enda databasen vet: lastat, nästa är trakten.
    const steg = samma && utkast!.steg === 'hem' ? 'Vägen hem'
      : samma && utkast!.steg === 'dest' && utkast!.dest ? `På väg till ${utkast!.dest.namn}`
      : 'Vart ska den?';
    return { kalla: 'db', namn, rad: `${lassat} · ${steg}`, behallUtkast: samma };
  }

  // Utan öppen flytt: bara stegen efter lastningen räknas (Vart ska X? / Vägen hem), och bara ur ett utkast som gäller.
  if (utkast && (utkast.steg === 'dest' || utkast.steg === 'hem')) {
    const namn = utkast.extern?.namn ?? (utkast.maskinId ? namnFor(utkast.maskinId) : null) ?? 'maskinen';
    const rad = utkast.steg === 'hem' ? (utkast.lossad ? `Lossad på ${utkast.lossad.namn} · Vägen hem` : 'Vägen hem')
      : utkast.lossad ? `Lossad på ${utkast.lossad.namn} · Vägen hem`
      : utkast.dest ? `På väg till ${utkast.dest.namn}` : 'Vart ska den?';
    return { kalla: 'utkast', namn, rad, behallUtkast: true };
  }
  return null;
}
