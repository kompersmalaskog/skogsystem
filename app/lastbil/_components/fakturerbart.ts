// Fakturerbart-summan: en källa för remsan (Lastbilen, alla flikar) och kvittot i Fakturering-fliken
// (steg 3; raderna kommer ur samma läsning, så remsan och listan aldrig kan läsa olika underlag). Summan är SUMMAN AV DET SOM VISAS: varje flytt avrundas först (hela km),
// sedan summeras — aldrig råvärden som avrundas en gång (skillen, "Avläsbarhet först").
//
// GODKÄNNANDET (migration 20261015151948): en flytt är ogodkänd tills admin trycker Godkänn, som en
// arbetsdag är obekräftad tills föraren trycker Stämmer. En ogodkänd flytt har inte gått till
// faktureringen än och ingår därför inte i pengatalet — den räknas som "väntar", och påminnelsen i
// Lastbilen (vantar.ts) leder till listan "Att godkänna".
//
// En struken flytt (status 'struken') är inte fakturerbar och ingår aldrig i talet. Flyttloggens
// gamla kvitto summerade även strukna rader; i prod finns ingen struken rad än, så talen är
// desamma idag — men två ställen får inte räkna olika, och det här är det rätta.

/** Raden ur fakturaunderlag_flytt som summeringen behöver. */
export interface FaktureratRad {
  km: number | null;
  status: string;                  // 'aktiv' | 'struken'
  fakturerad_tid: string | null;
  godkand_tid: string | null;      // NULL = ogodkänd (väntar på admin)
}

/**
 * Godkänd = admin har tryckt Godkänn. En redan fakturerad flytt räknas också som godkänd: den har
 * passerat hela kedjan (och raderna som fanns före godkännandet fick backfill-godkännande).
 */
export const arGodkand = (r: Pick<FaktureratRad, 'godkand_tid' | 'fakturerad_tid'>): boolean =>
  r.godkand_tid != null || r.fakturerad_tid != null;

export interface FakturerbartSumma {
  km: number;                      // hela km, summa av avrundade GODKÄNDA flyttar
  antal: number;                   // flyttar som räknas (godkända, ej strukna)
  hos: number;                     // hos faktureringen: godkända, inte fakturerade
  fakturerad: number;
  struken: number;                 // visas bara om > 0
  utanKm: number;                  // flyttar utan km — räknas i antal men kan inte läggas till km
  vantar: number;                  // ogodkända aktiva flyttar: inte i talet, väntar på Godkänn
}

export function summeraFakturerbart(rader: readonly FaktureratRad[]): FakturerbartSumma {
  let km = 0, antal = 0, fakturerad = 0, struken = 0, utanKm = 0, vantar = 0;
  for (const r of rader) {
    if (r.status === 'struken') { struken++; continue; }
    if (!arGodkand(r)) { vantar++; continue; }
    antal++;
    if (r.fakturerad_tid) fakturerad++;
    if (r.km == null) utanKm++;
    else km += Math.round(r.km);
  }
  return { km, antal, hos: antal - fakturerad, fakturerad, struken, utanKm, vantar };
}

/** En kvittorad: en per fakturerbar flytt, auto-skapad av databastriggern. Kvittot speglar bara status. */
export interface UnderlagRad extends FaktureratRad {
  id: string;
  /** Flytten raden hör till (maskin_flytt.id) — det som sheeten "Flytten" rättar och stryker. */
  flytt_id: string | null;
  kund: string | null;
  datum: string | null;            // date: 'YYYY-MM-DD'
  maskin: string | null;           // coalesce(extern_maskin, maskin_id)
  fran_objekt_id: string | null;
  fran_plats_id: string | null;
  till_objekt_id: string | null;
  till_plats_id: string | null;
  struken_tid: string | null;
  struken_anledning: string | null;
  godkand_av: string | null;
  // Redigering före fakturering (migration 20261015155630): originalet bevaras av databasen.
  km_original: number | null;      // värdet FÖRE första ändringen (NULL = saknades) — gäller bara om redigerad_tid är satt
  kund_original: string | null;
  redigerad_tid: string | null;    // NULL = km och kund är orörda
  redigerad_av: string | null;
}

export type UnderlagStatus = 'att_godkanna' | 'hos' | 'fakturerad' | 'struken';

export const underlagStatus = (r: FaktureratRad): UnderlagStatus =>
  r.status === 'struken' ? 'struken' : r.fakturerad_tid ? 'fakturerad' : r.godkand_tid ? 'hos' : 'att_godkanna';

/**
 * Det som väntar på ditt Godkänn överst (äldsta först — det som legat längst), sedan det som är hos
 * faktureringen, fakturerade och sist strukna; nyast först inom de tre sista.
 */
export function sorteraUnderlag<T extends UnderlagRad>(rader: readonly T[]): T[] {
  const rank: Record<UnderlagStatus, number> = { att_godkanna: 0, hos: 1, fakturerad: 2, struken: 3 };
  return [...rader].sort((a, b) => {
    const sa = underlagStatus(a), sb = underlagStatus(b);
    if (sa !== sb) return rank[sa] - rank[sb];
    return sa === 'att_godkanna'
      ? (a.datum ?? '').localeCompare(b.datum ?? '')
      : (b.datum ?? '').localeCompare(a.datum ?? '');
  });
}


// ── Redigerade värden: ett ändrat tal får aldrig se ut som en mätning ────────────────────────────────
// Märkningen följer av att värdet SKILJER SIG från originalet — en km som ändrats och sedan satts
// tillbaka till originalet är inte "ändrad". `redigerad_tid` avgör om originalet gäller alls, så ett
// original som är NULL (kund saknades) går att skilja från "aldrig redigerad".

const kundNorm = (s: string | null | undefined): string | null => (s ?? '').trim() || null;
const lika = (a: number | null, b: number | null) => (a == null || b == null ? a == b : Math.abs(a - b) < 1e-9);

export const kmAndrad = (r: Pick<UnderlagRad, 'km' | 'km_original' | 'redigerad_tid'>): boolean =>
  r.redigerad_tid != null && !lika(r.km, r.km_original);

export const kundAndrad = (r: Pick<UnderlagRad, 'kund' | 'kund_original' | 'redigerad_tid'>): boolean =>
  r.redigerad_tid != null && kundNorm(r.kund) !== kundNorm(r.kund_original);

/** Hela km upp till en decimal, svensk decimalkomma: 47 → "47", 46.6 → "46,6". */
export const fmtKm = (km: number): string => km.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

/** "ändrad från 47" · "ifylld, saknades i datan" · "borttagen, var 47". Null = inte ändrad. */
export function kmAndringsText(r: Pick<UnderlagRad, 'km' | 'km_original' | 'redigerad_tid'>): string | null {
  if (!kmAndrad(r)) return null;
  if (r.km_original == null) return 'ifylld, saknades i datan';
  if (r.km == null) return `borttagen, var ${fmtKm(r.km_original)}`;
  return `ändrad från ${fmtKm(r.km_original)}`;
}

/** Samma för kund: "ändrad från Vida" · "tillagd, saknades i datan" · "borttagen, var Vida". */
export function kundAndringsText(r: Pick<UnderlagRad, 'kund' | 'kund_original' | 'redigerad_tid'>): string | null {
  if (!kundAndrad(r)) return null;
  const orig = kundNorm(r.kund_original);
  if (orig == null) return 'tillagd, saknades i datan';
  if (kundNorm(r.kund) == null) return `borttagen, var ${orig}`;
  return `ändrad från ${orig}`;
}

/** Går raden att rätta? Före fakturering, så länge den inte är struken (databasen vägrar annars). */
export const kanRedigeras = (r: FaktureratRad): boolean => r.status === 'aktiv' && !r.fakturerad_tid;

/** Under kund-raden i sheeten: "Tillagd av Martin tor 15 okt" · "Ändrad från Vida" · null när den inte rörts. */
export function kundNotis(r: Pick<UnderlagRad, 'kund' | 'kund_original' | 'redigerad_tid' | 'redigerad_av'>, datum: (iso: string) => string): string | null {
  if (!kundAndrad(r)) return null;
  const orig = kundNorm(r.kund_original);
  if (orig == null) return `Tillagd av ${r.redigerad_av ?? 'okänd'}${r.redigerad_tid ? ' ' + datum(r.redigerad_tid) : ''}`;
  if (kundNorm(r.kund) == null) return `Borttagen — var ${orig}`;
  return `Ändrad från ${orig}`;
}

/** Sträckan i fakturan bredvid det mätta: "53 km · mätt 53" · "48 km · mätt 53". Saknas värdet står det. */
export function strackaNotis(km: number | null, matt: number | null): string {
  const fakt = km != null ? `${fmtKm(km)} km` : 'km saknas i datan';
  return matt != null ? `${fakt} · mätt ${fmtKm(matt)}` : fakt;
}
