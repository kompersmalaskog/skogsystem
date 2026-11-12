// Cert — revisionsöversikten, ren logik (ingen databas, ingen React).
//
// Frågan: "Är vi redo för revisionen?" Underlaget är SE:s kravlista (cert_krav, 78 krav i 6 sektioner). Ett krav som
// gäller oss ('Ja' eller 'Om aktuellt') är KLART först när det både är klart och uppladdat hos SE.
// Krav med kalla = 'utbildning' bockas aldrig av för hand: läget räknas ur Utbildning (utbildning_status + cert_se).

export type Krav = {
  kravNr: string;
  namn: string;
  sektionNr: number;
  sektion: string;
  gallerOss: 'Ja' | 'Nej' | 'Om aktuellt';
  underlag: string;
  hurOfta: string;
  varFinns: string;
  klar: boolean;
  uppladdadSe: boolean;
  kalla: 'utbildning' | null;
};

/** Läget i Utbildning för ett krav med kalla = 'utbildning'. `typId` null = liggaren (alla utbildningar). */
export type UtbLage = {
  typId: string | null;
  /** Personer (eller, för liggaren, person × utbildning) som kravet gäller. */
  antal: number;
  /** Har ett intyg som gäller idag. */
  giltiga: number;
  /** Har ett intyg infört, giltigt eller inte. */
  medIntyg: number;
  /** Giltiga intyg som är märkta "Uppladdat hos SE" i Utbildning. */
  uppladdade: number;
};

export type Status = 'klart' | 'saknas' | 'ej_uppladdat';

export const STATUS_TEXT: Record<Status, string> = { klart: 'Klart', saknas: 'Saknas', ej_uppladdat: 'Inte uppladdat hos SE' };

/** Liggaren: kravet är själva förteckningen, inte en kurs. */
export const LIGGARE = '3.1.11';

/** Vad kursen heter i en mening ("5 av 7 har HLR"). */
const KURS: Record<string, string> = { '3.1.1': 'SYN avverkning', '3.1.8': 'naturvärdesbedömning', '3.1.9': 'ADR', '3.1.10': 'HLR' };

export const galler = (k: Krav) => k.gallerOss !== 'Nej';

export function status(k: Krav, utb?: UtbLage | null): Status {
  if (k.kalla !== 'utbildning') return !k.klar ? 'saknas' : k.uppladdadSe ? 'klart' : 'ej_uppladdat';
  if (!utb) return 'saknas';
  if (k.kravNr === LIGGARE) {
    if (utb.antal === 0 || utb.medIntyg < utb.antal) return 'saknas';
    return k.uppladdadSe ? 'klart' : 'ej_uppladdat';
  }
  // Ingen berörs: klart bara när kravet är "om aktuellt" (ingen kör farligt gods). Annars är utbildningen inte igång.
  if (utb.antal === 0) return k.gallerOss === 'Om aktuellt' ? 'klart' : 'saknas';
  if (utb.giltiga < utb.antal) return 'saknas';
  return utb.uppladdade < utb.antal ? 'ej_uppladdat' : 'klart';
}

/** Raderna i arket för ett krav som räknas ur Utbildning. */
export function utbRader(k: Krav, utb?: UtbLage | null): string[] {
  if (!utb) return ['Utbildningen finns inte i Utbildning.'];
  if (k.kravNr === LIGGARE) {
    return [utb.antal === 0 ? 'Ingen utbildning är igång.' : `${utb.medIntyg} av ${utb.antal} utbildningar har ett intyg infört`];
  }
  const kurs = KURS[k.kravNr] ?? k.namn;
  if (utb.antal === 0) return [k.gallerOss === 'Om aktuellt' ? `Ingen behöver ${kurs} just nu.` : `Ingen är vald för ${kurs} i Utbildning.`];
  return [`${utb.giltiga} av ${utb.antal} har ${kurs}`, `${utb.uppladdade} av ${utb.antal} intyg uppladdade hos SE`];
}

/** 3.1.9 före 3.1.10: kravnummer jämförs del för del som tal. */
export function jamforKravNr(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export type KravRad = { krav: Krav; status: Status };
export type SektionVy = { nr: number; namn: string; kvar: number; rader: KravRad[]; gallerInte: Krav[] };
export type Vy = { rubrik: string; kvar: number; sektioner: SektionVy[] };

export function byggVy(krav: Krav[], utb: Record<string, UtbLage>): Vy {
  const sektioner = new Map<number, SektionVy>();
  for (const k of [...krav].sort((a, b) => a.sektionNr - b.sektionNr || jamforKravNr(a.kravNr, b.kravNr))) {
    const s = sektioner.get(k.sektionNr) ?? { nr: k.sektionNr, namn: k.sektion, kvar: 0, rader: [], gallerInte: [] };
    sektioner.set(k.sektionNr, s);
    if (!galler(k)) { s.gallerInte.push(k); continue; }
    const st = status(k, utb[k.kravNr]);
    s.rader.push({ krav: k, status: st });
    if (st !== 'klart') s.kvar++;
  }
  const lista = [...sektioner.values()];
  const kvar = lista.reduce((n, s) => n + s.kvar, 0);
  return { kvar, sektioner: lista, rubrik: kvar === 0 ? 'Redo för revisionen' : `${kvar} ${kvar === 1 ? 'sak' : 'saker'} kvar till revisionen` };
}

export const kvarText = (kvar: number) => (kvar === 0 ? 'Klart' : `${kvar} kvar`);
export const gallerInteText = (n: number) => `${n} gäller inte er`;
