// Objektets ark i Redigering — all text och alla tal på översikten, ren logik (Martin 2026-10-23: "som markägarrapporten",
// "lätt för hjärnan"). Komponenten (components/redigering/ObjektOversikt.tsx) ritar bara det som byggs här.
//
// Svaret först: var står objektet (Pågår / Skotning kvar / Klart / Inte påbörjat) i ett ord, och en mening med talen.
// Sedan frågor: Vad saknas? · Stämmer uppgifterna? (varifrån varje värde kom) · Vad har maskinerna skickat? · Är det klart?
// · Vem kör? · Hur får vi betalt? · Mer (undersidor, egenskaper, dokument, VO-nummer) — ett enda ark per objekt.

import { AVTALSFORM_ORD } from './behoverDig';
import { faltGaller, arPrivat } from './faltGaller';

const m3 = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} m³`;
const tomt = (v: unknown) => v == null || String(v).trim() === '';

const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "2026-10-14" → "14 okt"; annat år får årtalet med ("14 okt 2025"). */
export function kortDatum(ymd: string | null | undefined, idag: Date = new Date()): string {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  if (!m) return String(ymd);
  const [, ar, man, dag] = m;
  const bas = `${Number(dag)} ${MANADER[Number(man) - 1]}`;
  return Number(ar) === idag.getFullYear() ? bas : `${bas} ${ar}`;
}

export interface LageIndata {
  skordat: number;
  skotat: number;
  skordningAvslutad?: string | null;
  skotningAvslutad?: string | null;
  status?: string | null;
  /** Annan maskin avverkar — vi skotar bara. */
  externSkordning?: boolean;
  /** Markägaren skotar själv, eller en inlejd skotare — vi skotar inte. */
  annanSkotar?: boolean;
}

export interface Lage {
  /** Ett ord eller två: det stora svaret. */
  svar: string;
  /** En mening med talen. */
  mening: string;
  /** Klart = dämpat (inget att göra), pågående = vanligt. */
  klart: boolean;
}

/** Var står objektet? Svaret i ett par ord och en mening med talen. */
export function objektLage(x: LageIndata): Lage {
  const kvar = Math.max(0, x.skordat - x.skotat);
  const skotningKlar = !!x.skotningAvslutad || x.annanSkotar === true;
  const skordningKlar = !!x.skordningAvslutad || x.externSkordning === true;

  if ((skotningKlar && skordningKlar && (x.skotningAvslutad || x.skordningAvslutad)) || x.status === 'avslutat') {
    const datum = x.skotningAvslutad ?? x.skordningAvslutad;
    if (x.skordat <= 0 && x.skotat <= 0) return { svar: 'Klart', mening: datum ? `Avslutat ${kortDatum(datum)}.` : 'Avslutat.', klart: true };
    const tal = x.skotat > 0 ? `${m3(x.skordat)} skördat, ${m3(x.skotat)} skotat.` : `${m3(x.skordat)} skördat.`;
    return { svar: 'Klart', mening: datum ? `${tal} Klart ${kortDatum(datum)}.` : tal, klart: true };
  }
  if (x.skordat <= 0 && x.skotat <= 0) {
    return { svar: x.status === 'pagaende' ? 'Pågår' : 'Inte påbörjat', mening: 'Inget har kommit från maskinerna än.', klart: false };
  }
  if (skordningKlar && !skotningKlar) {
    return kvar > 0
      ? { svar: 'Skotning kvar', mening: `${m3(kvar)} ligger på backen av ${Math.round(x.skordat).toLocaleString('sv-SE')} skördade.`, klart: false }
      : { svar: 'Skotning kvar', mening: `${m3(x.skordat)} skördat, allt skotat — skotningen är inte markerad klar.`, klart: false };
  }
  if (x.skotat > 0) return { svar: 'Pågår', mening: `${m3(x.skordat)} skördat · ${m3(x.skotat)} skotat.`, klart: false };
  return { svar: 'Pågår', mening: `${m3(x.skordat)} skördat.`, klart: false };
}

/** Raden överst: "Slutavverkning · Vida · VO 11124938" — bara det som finns. */
export function metaRad(obj: { huvudtyp?: string | null; bolag?: string | null; vo_nummer?: string | null }): string {
  return [obj.huvudtyp, obj.bolag, obj.vo_nummer ? `VO ${String(obj.vo_nummer).trim()}` : null].filter(v => !tomt(v)).join(' · ');
}

/**
 * Varifrån värdet kom, i ord under fältet. Provenansen (`dim_objekt.auto_ifyllt`) går först; annars "samma som trakten"
 * när trakten säger samma sak. Säger trakten något annat står det — det är det enda som är värt att titta på.
 * null = inget att säga (en människa har skrivit det, eller ingen källa finns).
 */
export function kallaText(varde: unknown, trakt: unknown, provenans: unknown): string | null {
  const v = String(varde ?? '').trim();
  const t = String(trakt ?? '').trim();
  const p = String(provenans ?? '').trim();
  if (!v) return null;
  if (t && t.toLowerCase() !== v.toLowerCase()) return `trakten säger ${t}`;
  if (p === 'trakt') return 'från trakten';
  if (p.startsWith('härlett:')) return `från ${p.slice('härlett:'.length).trim()}`;
  if (t) return 'samma som trakten';
  return null;
}

/** Säger trakten emot det som står? Då ska raden synas (orange text i komponenten). */
export function traktSagerEmot(varde: unknown, trakt: unknown): boolean {
  const v = String(varde ?? '').trim();
  const t = String(trakt ?? '').trim();
  return !!v && !!t && v.toLowerCase() !== t.toLowerCase();
}

// Inköpare och avverkningsform visas inte längre (Martin 2026-10-24); fälten finns kvar i datan.
export type UppgiftNyckel = 'huvudtyp' | 'avtalsform' | 'atgard' | 'bolag' | 'skogsagare' | 'vo_nummer';

export interface UppgiftRad {
  nyckel: UppgiftNyckel;
  etikett: string;
  varde: string;
  /** Under etiketten: varifrån värdet kom, eller "trakten säger …". */
  kalla: string | null;
  emot: boolean;
}

type ObjFalt = Partial<Record<UppgiftNyckel | 'auto_ifyllt', any>>;

/**
 * Raderna i "Stämmer uppgifterna?": bara IFYLLDA fält som gäller objektet. Det som saknas står i "Vad saknas?".
 * `trakt` = planeringens objekt-rad (Vidas leverans): markagare, inkopare, avtalsform, atgard.
 */
export function uppgiftRader(obj: ObjFalt, trakt: Record<string, any> | null): UppgiftRad[] {
  const prov = obj.auto_ifyllt ?? {};
  const rader: UppgiftRad[] = [];
  const lagg = (nyckel: UppgiftNyckel, etikett: string, traktVarde?: unknown, visning?: (v: string) => string) => {
    const v = String(obj[nyckel] ?? '').trim();
    if (!v) return;
    rader.push({
      nyckel, etikett, varde: visning ? visning(v) : v,
      kalla: kallaText(v, traktVarde, prov[nyckel]),
      emot: traktSagerEmot(v, traktVarde),
    });
  };
  lagg('huvudtyp', 'Typ');
  if (faltGaller('avtalsform', obj)) lagg('avtalsform', 'Avtalsform', trakt?.avtalsform, v => AVTALSFORM_ORD[v] ? `${AVTALSFORM_ORD[v]} (${v})` : v);
  if (faltGaller('atgard', obj)) lagg('atgard', 'Åtgärd', trakt?.atgard);
  lagg('bolag', 'Bolag');
  lagg('skogsagare', 'Markägare', trakt?.markagare);
  lagg('vo_nummer', 'VO-nummer');
  return rader;
}

/** Fält som saknas och som inte appen kan föreslå: dem öppnar man objektet för. */
export function saknadeUtanForslag(obj: ObjFalt & { object_name?: string | null }): { nyckel: UppgiftNyckel | 'object_name'; etikett: string }[] {
  const ut: { nyckel: UppgiftNyckel | 'object_name'; etikett: string }[] = [];
  if (tomt(obj.object_name)) ut.push({ nyckel: 'object_name', etikett: 'Namn' });
  if (faltGaller('atgard', obj) && tomt(obj.atgard)) ut.push({ nyckel: 'atgard', etikett: 'Åtgärd' });
  if (tomt(obj.skogsagare)) ut.push({ nyckel: 'skogsagare', etikett: 'Markägare' });
  return ut;
}

export interface MaskinFilRad {
  maskinId: string;
  modell?: string | null;
  typ?: string | null;
  antalFiler: number;
  senasteData?: string | null;
}

/** En rad per maskin: "Giant" · "6 filer · t.o.m. 14 okt" · m³ bara när maskinen är ensam om sin typ (annars vore talet gruppens). */
export function maskinRader(rader: MaskinFilRad[], skordat: number, skotat: number): { id: string; titel: string; under: string; hoger: string | null }[] {
  const perTyp = (typ: string) => rader.filter(r => r.typ === typ).length;
  return rader.map(r => {
    const filer = `${r.antalFiler} ${r.antalFiler === 1 ? 'fil' : 'filer'}`;
    const datum = r.senasteData ? ` · t.o.m. ${kortDatum(r.senasteData)}` : '';
    const vol = r.typ === 'skordare' && perTyp('skordare') === 1 && skordat > 0 ? m3(skordat)
      : r.typ === 'skotare' && perTyp('skotare') === 1 && skotat > 0 ? m3(skotat) : null;
    return { id: r.maskinId, titel: r.modell || r.maskinId, under: `${r.typ === 'skordare' ? 'Skördare' : r.typ === 'skotare' ? 'Skotare' : 'Maskin'} · ${filer}${datum}`, hoger: vol };
  });
}

export interface AvslutForslag { field: string; autoField: string; label: string; maskinTyp: 'harvester' | 'forwarder'; datum: string; kalla: 'maskindata' | 'stale'; dagar?: number }

/** Varför appen föreslår att något är klart, i en mening. */
export function avslutVarfor(f: AvslutForslag): string {
  return f.kalla === 'maskindata'
    ? `Maskinen rapporterade sista dagen ${kortDatum(f.datum)}.`
    : `Inget har kommit på ${f.dagar ?? '?'} dagar — sista ${kortDatum(f.datum)}.`;
}

/**
 * Tecken på att objektet är ett special-objekt (vindfällor, storm): avtalsformen VF/Bark, eller VF/STORM i namnet.
 * Bara ett tips i objektets ark — aldrig en fråga i "Behöver dig", eftersom ett "nej" inte går att spara (special är
 * false både när någon svarat nej och när ingen frågat) och frågan då skulle komma tillbaka för alltid.
 */
export function specialTecken(obj: { special?: boolean | null; avtalsform?: string | null; object_name?: string | null }): string | null {
  if (obj.special === true) return null;
  if (String(obj.avtalsform ?? '').trim() === 'VF/Bark') return 'Avtalsformen är vindfälle.';
  const ord = String(obj.object_name ?? '').toUpperCase().split(/[^A-ZÅÄÖ0-9]+/);
  if (ord.includes('SPECIAL')) return 'Namnet säger special.';
  if (ord.includes('VF') || ord.some(o => o.startsWith('STORM') || o.startsWith('VINDF'))) return 'Namnet säger vindfälle eller storm.';
  return null;
}

export interface SkotatIndata {
  skordat: number;
  /** Skotat enligt lassen (maskinens filer). */
  skotat: number;
  /** Skotad volym satt för hand (färdigskotat) — 0 när ingen. */
  manuell: number;
  skordningAvslutad?: string | null;
  skotningAvslutad?: string | null;
  /** Markägaren eller en inlejd skotare skotar — inte vår volym. */
  annanSkotar?: boolean;
  risjobb?: boolean;
}

/**
 * Skotat ska vara det skördaren avverkat (Martin 2026-10-24: "9 av 10 är det vad skördaren kört som man skotat").
 * När skördningen eller skotningen är klar och lassen säger mindre föreslår arket att sätta skotat till skördat —
 * ett tryck, aldrig av sig själv (en beräknad volym lagras inte som en mätning utan att någon sagt ja).
 * 'satt' = redan satt för hand. null = inget att säga.
 */
export function skotatLage(x: SkotatIndata): { typ: 'forslag'; skotat: number; skordat: number } | { typ: 'satt'; varde: number } | null {
  if (x.annanSkotar || x.risjobb) return null;
  if (x.manuell > 0) return { typ: 'satt', varde: Math.round(x.manuell) };
  const skordat = Math.round(x.skordat);
  const skotat = Math.round(x.skotat);
  if (skordat <= 0 || skotat >= skordat) return null;
  if (!x.skordningAvslutad && !x.skotningAvslutad) return null;
  return { typ: 'forslag', skotat, skordat };
}
