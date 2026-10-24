// "Behöver dig" — det enda Redigering frågar om. Ren logik: vyn ritar bara det som byggs här.
//
// En sak per fråga, inte per objekt: ett objekt som saknar både typ och avtalsform är två saker, i den ordning de måste
// besvaras (typen avgör om avtalsform alls gäller). Varje fältsak bär appens förslag (`harled`) så svaret blir ett tryck.
//
// Ordning: fält med ett förslag först (ett tryck var), sedan maskinjobb utan objekt, sist det som kräver att man öppnar
// objektet (markägare, namn, avslut …) — de kan inte besvaras i arket.

import { AVTALSFORMER } from '@/lib/trakt/avtalsform';
import { harled, kallorText, namnOrd, type Harledning, type HarledRad, type HarlettFalt } from './harledning';
import { faltGaller } from './faltGaller';

export const HUVUDTYP_VAL = ['Slutavverkning', 'Gallring', 'Grot'] as const;

/**
 * Svaret "Special" på frågan om avtalsform (Martin 2026-10-24, "Björsamåla special vid hus mm"): objektet har ingen
 * avtalsform — det är ett special-objekt. Sparas som `dim_objekt.special = true`, aldrig som en avtalsform.
 */
export const SPECIAL_SVAR = 'Special';

/** Avtalsformens kortform → det man säger. */
export const AVTALSFORM_ORD: Record<string, string> = {
  Au: 'Avverkningsuppdrag', Rp: 'Rotpost', LRK: 'Leveransrotköp', 'VF/Bark': 'Vindfälle / bark',
};

export const FRAGA: Record<HarlettFalt, string> = {
  huvudtyp: 'Vad är det för jobb?',
  avtalsform: 'Hur är trakten avtalad?',
  bolag: 'Vem köper virket?',
};

/** Kort etikett i listan ("Saknar avtalsform"). */
const SAKNAR: Record<HarlettFalt, string> = { huvudtyp: 'Saknar typ', avtalsform: 'Saknar avtalsform', bolag: 'Saknar bolag' };

export interface BehoverGrupp {
  nyckel: string;
  /** Representantraden (kortets ansikte). */
  rep: HarledRad & { risskotning?: boolean | null };
  /** Alla dim_objekt-id i VO-gruppen — sparningen gäller hela gruppen. */
  ids: string[];
  /** getWarnings över gruppen: { key, text }. */
  varningar: { key: string; text: string }[];
}

export interface FilJobb {
  nyckel: string;
  namn: string | null;
  vo: string;
  stammar: number;
  maskinNamn: string;
  /** Senaste filens dag ("2026-10-23"). */
  datum?: string | null;
  kandidater: { objekt_id: string; vo_nummer: string | null; object_name: string | null; skogsagare?: string | null }[];
}

export type Sak =
  | { typ: 'falt'; nyckel: string; grupp: BehoverGrupp; falt: HarlettFalt; namn: string; under: string; forslag: Harledning | null; val: string[] }
  | { typ: 'fil'; nyckel: string; jobb: FilJobb; namn: string; under: string }
  | { typ: 'oppna'; nyckel: string; grupp: BehoverGrupp; namn: string; under: string }
  /** Flera saker på SAMMA objekt = en rad (Martin 2026-10-24: "varför ligger det så många mölleryd i listan").
   *  Arket tar frågorna i tur och ordning och sist det som rättas inne i objektet. */
  | { typ: 'objekt'; nyckel: string; grupp: BehoverGrupp; namn: string; under: string; fragor: FaltSak[]; ovrigt: string[] };

export type FaltSak = Extract<Sak, { typ: 'falt' }>;

const FALT_FRAN_VARNING: Record<string, HarlettFalt> = { huvudtyp: 'huvudtyp', avtalsform: 'avtalsform', bolag: 'bolag' };

/** Namnet på raden: objektets namn, annars VO. */
export function sakNamn(rad: { object_name?: string | null; vo_nummer?: string | null }): string {
  return (rad.object_name ?? '').trim() || (rad.vo_nummer ? `VO ${rad.vo_nummer}` : 'Namnlöst objekt');
}

/** Förslaget kort, till höger på raden: "Rp?" — frågetecknet säger att det är appens gissning. */
export function forslagKort(s: Sak): string {
  if (s.typ === 'fil') return 'Koppla';
  if (s.typ === 'oppna') return 'Öppna';
  if (s.typ === 'objekt') return `${s.fragor.length + s.ovrigt.length} saker`;
  if (!s.forslag?.varde) return 'Välj';
  return `${s.forslag.varde}?`;
}

/** Varför appen föreslår det den föreslår, i en mening. */
export function varforText(f: Harledning | null): string {
  if (!f || f.varde == null) {
    if (f && f.emot.length > 0) return `Källorna säger olika: ${f.emot.map(e => `${kallorText(e.kallor)} säger ${e.varde}`).join(', ')}.`;
    return 'Inget i datan säger det, så du får välja.';
  }
  const bas = f.kallor.length > 1 ? `${versal(kallorText(f.kallor))} säger samma sak.` : `${versal(f.kallor[0])} säger det.`;
  if (f.emot.length === 0) return bas;
  return `${bas} Men ${f.emot.map(e => `${kallorText(e.kallor)} säger ${e.varde}`).join(', ')}.`;
}

const versal = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function byggSaker(input: { grupper: BehoverGrupp[]; alla: HarledRad[]; filJobb: FilJobb[]; bolagVal: string[] }): Sak[] {
  const falt: Sak[] = [];
  const oppna: Sak[] = [];

  for (const g of input.grupper) {
    for (const v of g.varningar) {
      const f = FALT_FRAN_VARNING[v.key];
      if (f) {
        if (f === 'avtalsform' && !faltGaller('avtalsform', g.rep)) continue;
        let forslag = harled(f, g.rep, input.alla);
        // Namnet säger "special" och inget annat säger något: föreslå Special (aldrig säkert — ett förslag att trycka på).
        if (f === 'avtalsform' && forslag?.varde == null && (forslag?.emot.length ?? 0) === 0 && namnOrd(g.rep.object_name).includes('SPECIAL')) {
          forslag = { falt: f, varde: SPECIAL_SVAR, kallor: ['namnet'], saker: false, emot: [] };
        }
        const val = f === 'huvudtyp' ? [...HUVUDTYP_VAL] : f === 'avtalsform' ? [...AVTALSFORMER, SPECIAL_SVAR] : input.bolagVal;
        falt.push({ typ: 'falt', nyckel: `${g.nyckel}:${f}`, grupp: g, falt: f, namn: sakNamn(g.rep), under: underFalt(f, forslag), forslag, val });
      } else {
        oppna.push({ typ: 'oppna', nyckel: `${g.nyckel}:${v.key}`, grupp: g, namn: sakNamn(g.rep), under: v.text });
      }
    }
  }

  const filer: Sak[] = input.filJobb.map(j => ({
    typ: 'fil' as const, nyckel: `fil:${j.nyckel}`, jobb: j,
    namn: j.namn || `VO ${j.vo}`,
    under: [j.maskinNamn, filDag(j.datum), j.stammar > 0 ? `${j.stammar.toLocaleString('sv-SE')} stammar` : null, 'inget objekt'].filter(Boolean).join(' · '),
  }));

  // Ett objekt = en rad. Har objektet bara en sak står den som förut; flera blir en objektrad.
  const ensamma: Sak[] = [];
  const objektRader: Sak[] = [];
  const nycklar = Array.from(new Set([...falt, ...oppna].map(s => (s as FaltSak).grupp.nyckel)));
  for (const nyckel of nycklar) {
    const f = falt.filter(s => (s as FaltSak).grupp.nyckel === nyckel) as FaltSak[];
    const o = oppna.filter(s => (s as Extract<Sak, { typ: 'oppna' }>).grupp.nyckel === nyckel) as Extract<Sak, { typ: 'oppna' }>[];
    if (f.length + o.length === 1) { ensamma.push(f[0] ?? o[0]); continue; }
    const g = (f[0] ?? o[0]).grupp;
    const delar = [...f.map(s => SAKNAR[s.falt]), ...o.map(s => kortText(s.under))];
    objektRader.push({
      typ: 'objekt', nyckel: `objekt:${nyckel}`, grupp: g, namn: sakNamn(g.rep),
      under: versal(delar.map((d, i) => (i === 0 ? d : forstaLiten(d))).join(' · ')),
      fragor: f, ovrigt: o.map(s => kortText(s.under)),
    });
  }

  // Förslag först (ett tryck var), sedan "välj" utan förslag, maskinfiler, och sist det man öppnar objektet för.
  const harForslag = (s: Sak) =>
    (s.typ === 'falt' && s.forslag?.varde != null) || (s.typ === 'objekt' && s.fragor.some(q => q.forslag?.varde != null));
  const rang = (s: Sak) => (harForslag(s) ? 0 : s.typ === 'falt' || s.typ === 'objekt' ? 1 : 3);
  const sorterade = [...ensamma, ...objektRader].sort((a, b) => rang(a) - rang(b));
  return [...sorterade.filter(s => rang(s) < 3), ...filer, ...sorterade.filter(s => rang(s) === 3)];
}

const forstaLiten = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** "Maskinen rapporterar skördning avslutad — ej markerad" → "Skördning klar?". Annat står som det är. */
export function kortText(text: string): string {
  const m = /rapporterar\s+(\S+)\s+avslutad/i.exec(text);
  return m ? `${versal(m[1])} klar?` : text;
}

function underFalt(f: HarlettFalt, forslag: Harledning | null): string {
  if (!forslag?.varde) return SAKNAR[f];
  const ord = f === 'avtalsform' ? (AVTALSFORM_ORD[forslag.varde] ?? forslag.varde).toLowerCase() : forslag.varde.toLowerCase();
  return `${SAKNAR[f]} · ${forslag.kallor[0]} säger ${ord}`;
}

/** Patchen ett svar ger. Grot är både en typ och risskotning-flaggan — de synkas alltid (lib/objekt/typ.ts). */
export function patchForSvar(falt: HarlettFalt, varde: string): Record<string, string | boolean> {
  if (falt === 'avtalsform' && varde === SPECIAL_SVAR) return { special: true };
  if (falt === 'huvudtyp') return { huvudtyp: varde, risskotning: varde === 'Grot' };
  return { [falt]: varde };
}

const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
/** "2026-10-23" → "23 okt". */
function filDag(d: string | null | undefined): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(d ?? ''));
  return m ? `${Number(m[2])} ${MANAD[Number(m[1]) - 1]}` : null;
}
