// MASSAVEDENS LÄNGD — gallringsskördarna (Martin 2026-11-09: "höja medellängden på massaveden i gallring, då kan vi höja
// produktionen på skotaren"). Bara Rottne H8E ser den i hytten; skotare och Giant ser ingenting.
//
// Underlaget är databasfunktionen massa_langd(p_maskiner, p_fran, p_till) (migration 20261109072740/20261109072819):
// en rad per maskin, förare, svensk dag, trädslag och längd i dm med antal stockar och summan av längderna i cm.
// Allt här är ren räkning på de raderna — ingen läsning, ingen React.
//
// Regler:
//  - Snittet är ALLTID summa_cm / antal över raderna, aldrig ett snitt av snitt.
//  - En förare är en PERSON: medarbetare_id när kopplingen finns, annars operator_id (samma regel som maskinvyns operatörskort).
//  - Inget mål och ingen färg på talet förrän Martin satt ett mål.

import { tradslagLabel } from './tradslag';

export interface MassaRad {
  maskin_id: string;
  operator_id: string | null;
  operator_namn: string | null;
  medarbetare_id: string | null;
  dag: string;            // YYYY-MM-DD, svensk dag
  tradslag: string;       // maskinens namn (GRAN, TALL …)
  langd_dm: number;
  antal: number;
  summa_cm: number;
}

export interface Snitt { antal: number; cm: number }

/** Gallringsskördare = Harvester av modellen H8E, inte avslutad. Giant (Scorpion) räknas inte. */
export function arGallringsskordare(m: { maskin_typ: string | null; modell: string | null; aktiv_till?: string | null } | null | undefined, idagISO?: string): boolean {
  if (!m || m.maskin_typ !== 'Harvester') return false;
  if (!(m.modell ?? '').toUpperCase().includes('H8E')) return false;
  if (idagISO && m.aktiv_till && m.aktiv_till < idagISO) return false;
  return true;
}

export function personNyckel(r: Pick<MassaRad, 'medarbetare_id' | 'operator_id'>): string {
  if (r.medarbetare_id) return `m:${r.medarbetare_id}`;
  if (r.operator_id) return `o:${r.operator_id}`;
  return 'okand';
}

export function summera(rader: readonly MassaRad[]): Snitt | null {
  let antal = 0, summa = 0;
  for (const r of rader) { antal += Number(r.antal) || 0; summa += Number(r.summa_cm) || 0; }
  return antal > 0 ? { antal, cm: summa / antal } : null;
}

/** "4,5 m" — en decimal, svenskt komma. */
export function meterText(cm: number): string {
  return `${(Math.round(cm / 10) / 10).toFixed(1).replace('.', ',')} m`;
}

// ── Datum (svensk tid) ───────────────────────────────────────────

export function svenskIdag(nu: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}

export function laggTillDagar(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Måndag–söndag veckan FÖRE den som idag ligger i. */
export function forraVeckan(idag: string): { fran: string; till: string } {
  const d = new Date(`${idag}T12:00:00Z`);
  const vd = (d.getUTCDay() + 6) % 7;          // måndag = 0
  const mandag = laggTillDagar(idag, -vd);
  return { fran: laggTillDagar(mandag, -7), till: laggTillDagar(mandag, -1) };
}

export type Period = 'idag' | 'vecka' | 'manad';
export const PERIODER: readonly (readonly [Period, string])[] = [['idag', 'Idag'], ['vecka', '7 dagar'], ['manad', '30 dagar']];

export function iPeriod(rader: readonly MassaRad[], period: Period, idag: string): MassaRad[] {
  const fran = period === 'idag' ? idag : laggTillDagar(idag, period === 'vecka' ? -6 : -29);
  return rader.filter(r => r.dag >= fran && r.dag <= idag);
}

export function mellan(rader: readonly MassaRad[], fran: string, till: string): MassaRad[] {
  return rader.filter(r => r.dag >= fran && r.dag <= till);
}

const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
/** "idag" / "igår" / "6 nov". */
export function dagOrd(dag: string, idag: string): string {
  if (dag === idag) return 'idag';
  if (dag === laggTillDagar(idag, -1)) return 'igår';
  return `${Number(dag.slice(8, 10))} ${MANAD[Number(dag.slice(5, 7)) - 1]}`;
}

// ── Vem är "jag" och vilken dag visas ────────────────────────────

/**
 * Förarens rader: den inloggade medarbetaren om hen har massaved på maskinen, annars föraren med flest stockar
 * på maskinens senaste dag med massaved (den som sitter i maskinen). null = maskinen har ingen massaved alls.
 */
export function valjJag(rader: readonly MassaRad[], maskinId: string, medarbetareId: string | null): { nyckel: string; namn: string } | null {
  const egna = rader.filter(r => r.maskin_id === maskinId);
  if (!egna.length) return null;
  if (medarbetareId) {
    const r = egna.find(x => x.medarbetare_id === medarbetareId);
    if (r) return { nyckel: personNyckel(r), namn: forNamn(r.operator_namn) };
  }
  const senast = egna.reduce((m, r) => (r.dag > m ? r.dag : m), '');
  const per = new Map<string, { antal: number; namn: string }>();
  for (const r of egna) {
    if (r.dag !== senast) continue;
    const k = personNyckel(r);
    const p = per.get(k) ?? { antal: 0, namn: forNamn(r.operator_namn) };
    p.antal += Number(r.antal) || 0;
    per.set(k, p);
  }
  const [nyckel, p] = [...per.entries()].sort((a, b) => b[1].antal - a[1].antal)[0];
  return { nyckel, namn: p.namn };
}

/** Förnamnet: första ordet i förarnamnet, med stor begynnelsebokstav ("OSKAR NILSSON" → "Oskar"). */
export function forNamn(namn: string | null | undefined): string {
  const f = (namn ?? '').trim().split(/\s+/)[0];
  if (!f) return 'Okänd förare';
  return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
}

/** Pillens tal: förarens snitt för senaste dagen med massaved på maskinen (idag när det finns). */
export function pillVarde(rader: readonly MassaRad[], maskinId: string, jag: string | null, idag: string): { dag: string; cm: number } | null {
  if (!jag) return null;
  const mina = rader.filter(r => r.maskin_id === maskinId && personNyckel(r) === jag);
  if (!mina.length) return null;
  const dag = mina.reduce((m, r) => (r.dag > m ? r.dag : m), '');
  const s = summera(mina.filter(r => r.dag === dag));
  return s ? { dag, cm: s.cm } : null;
}

/** "Massa idag" / "Massa igår" / "Massa 6 nov". */
export function pillEtikett(dag: string, idag: string): string {
  return `Massa ${dagOrd(dag, idag)}`;
}

// ── Grupperingar ─────────────────────────────────────────────────

export interface TradslagRad { tradslag: string; antal: number; cm: number }

export function perTradslag(rader: readonly MassaRad[]): TradslagRad[] {
  const m = new Map<string, MassaRad[]>();
  for (const r of rader) {
    const t = tradslagLabel(r.tradslag);
    const l = m.get(t) ?? [];
    l.push(r);
    m.set(t, l);
  }
  return [...m.entries()]
    .map(([tradslag, l]) => { const s = summera(l)!; return { tradslag, antal: s.antal, cm: s.cm }; })
    .filter(x => x.antal > 0)
    .sort((a, b) => b.antal - a.antal);
}

export interface LangdFordelning {
  /** En stapel per 10 cm från kortaste till längsta, luckor med 0 så att skalan är jämn. */
  staplar: { dm: number; antal: number }[];
  /** Den vanligaste längden (vid lika: den kortaste av dem). */
  vanligast: number;
  /** Den mittersta halvan av stockarna ligger mellan q1 och q3 (dm). */
  q1: number;
  q3: number;
  antal: number;
  cm: number;
}

/** Fördelningen i 10 cm-steg (langd_dm). null när det inte finns några stockar. */
export function langdFordelning(rader: readonly MassaRad[]): LangdFordelning | null {
  const m = new Map<number, number>();
  for (const r of rader) {
    const dm = Number(r.langd_dm) || 0;
    if (dm <= 0) continue;
    m.set(dm, (m.get(dm) ?? 0) + (Number(r.antal) || 0));
  }
  const s = summera(rader);
  if (!m.size || !s) return null;
  const min = Math.min(...m.keys()), max = Math.max(...m.keys());
  const staplar: { dm: number; antal: number }[] = [];
  for (let dm = min; dm <= max; dm++) staplar.push({ dm, antal: m.get(dm) ?? 0 });
  const total = staplar.reduce((t, x) => t + x.antal, 0);
  let vanligast = staplar[0].dm, top = -1, kum = 0, q1 = 0, q3 = 0;
  for (const x of staplar) {
    if (x.antal > top) { top = x.antal; vanligast = x.dm; }
    kum += x.antal;
    if (!q1 && kum >= total * 0.25) q1 = x.dm;
    if (!q3 && kum >= total * 0.75) q3 = x.dm;
  }
  return { staplar, vanligast, q1, q3, antal: s.antal, cm: s.cm };
}

/** "4,5 m" ur decimeter. */
export function dmText(dm: number): string {
  return `${(dm / 10).toFixed(1).replace('.', ',')} m`;
}

export interface ForareRad { nyckel: string; namn: string; maskiner: string[]; antal: number; cm: number; tradslag: TradslagRad[] }

/** En rad per förare, längst snitt först. */
export function perForare(rader: readonly MassaRad[]): ForareRad[] {
  const m = new Map<string, MassaRad[]>();
  for (const r of rader) {
    const k = personNyckel(r);
    const l = m.get(k) ?? [];
    l.push(r);
    m.set(k, l);
  }
  return [...m.entries()]
    .map(([nyckel, l]) => {
      const s = summera(l)!;
      const namn = forNamn(l.find(r => r.operator_namn)?.operator_namn);
      return { nyckel, namn, maskiner: [...new Set(l.map(r => r.maskin_id))].sort(), antal: s.antal, cm: s.cm, tradslag: perTradslag(l) };
    })
    .filter(f => f.antal > 0)
    .sort((a, b) => b.cm - a.cm || b.antal - a.antal);
}
