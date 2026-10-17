// "Klar med trakten?" — planerarens färdigplanering som rena funktioner (ingen React, ingen DB, ingen karta).
//
// Principen: appen fyller i det den kan, planeraren tittar och rättar. Det appen inte KAN veta (fältfrågorna) ställs alltid.
// Kortet har tre delar; bara de två första räknas som "kvar":
//   1. APPEN HAR FYLLT I — avlägg, basväg, bärighet, terräng, skotningsavstånd, skördare, skotare, prognos. Orange = kvar.
//   2. HAR DU… — sex frågor, alltid ställda, varje trakt. Obesvarad = kvar.
//   3. MARKÄGARE & ÖVRIGT — räknas aldrig (ved, band, breddat …).
// Basväg är kvar BARA när Vidas underlag har en basväg som ännu inte är ritad i appen. En trakt utan basväg visar "Ingen" och räknas som klar (många trakter
// behöver ingen) — appen gissar aldrig att en basväg saknas.
// "Klar för maskin" spärrar aldrig — den visar bara vad som är kvar.

// ── Status ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Objektets status när planeraren ännu inte tryckt "Klar för maskin". */
export const STATUS_OPLANERAD = 'oplanerad';
/** "Klar att köra": sätts av Klar för maskin (tillsammans med klar_skickad_timestamp). */
export const STATUS_PLANERAD = 'planerad';

/** Visas kvar-chippen / kortet för det här objektet? Bara medan trakten planeras (oplanerad, eller planerad där något ändrats sedan). */
export function arUnderPlanering(status: string | null | undefined): boolean {
  const s = (status ?? '').trim().toLowerCase();
  return s === STATUS_OPLANERAD || s === STATUS_PLANERAD;
}

// ── Har du… ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type HarDuId = 'gransar' | 'naturvarden' | 'kulturlamningar' | 'ledningar' | 'snitslat' | 'avlagg_hugga';
export type HarDuSvarVarde = 'ja' | 'behovs_inte' | 'inga' | 'nej';

export interface HarDuFraga {
  /** kort namn i sammanställningen ("Naturvärden") */
  kort: string;
  id: HarDuId;
  fraga: string;
  /** knappens ord för ja och för det andra svaret (alltid två val — "inget svar" är obesvarat) */
  ja: string;
  nej: string;
  nejVarde: Exclude<HarDuSvarVarde, 'ja'>;
}

/** De sex frågorna, i den ordning kortet visar dem. Ordlydelsen är planerarens (tavla 34). */
export const HAR_DU_FRAGOR: readonly HarDuFraga[] = [
  { id: 'gransar', kort: 'Gränser', fraga: 'Markerat gränserna?', ja: 'Ja', nej: 'Behövs inte', nejVarde: 'behovs_inte' },
  { id: 'naturvarden', kort: 'Naturvärden', fraga: 'Märkt naturvärden?', ja: 'Ja', nej: 'Inga hittade', nejVarde: 'inga' },
  { id: 'kulturlamningar', kort: 'Kulturlämningar', fraga: 'Kontrollerat kulturlämningar?', ja: 'Ja', nej: 'Inga hittade', nejVarde: 'inga' },
  { id: 'ledningar', kort: 'El-ledningar', fraga: 'Markerat el-ledningar?', ja: 'Ja', nej: 'Inga finns', nejVarde: 'inga' },
  { id: 'snitslat', kort: 'Snitslad basväg', fraga: 'Snitslat basvägen?', ja: 'Ja', nej: 'Behövs inte', nejVarde: 'behovs_inte' },
  { id: 'avlagg_hugga', kort: 'Avlägget huggs', fraga: 'Ska avlägget huggas?', ja: 'Ja', nej: 'Nej', nejVarde: 'nej' },
];

export interface HarDuPost { svar: HarDuSvarVarde; av: string | null; at: string }
export type HarDuSvar = Partial<Record<HarDuId, HarDuPost>>;

const SVAR: readonly string[] = ['ja', 'behovs_inte', 'inga', 'nej'];

/** objekt.har_du_svar (jsonb) → svar. Tolerant: allt som inte är en känd fråga med ett känt svar är obesvarat (aldrig ett kast). */
export function lasHarDu(raw: unknown): HarDuSvar {
  const ut: HarDuSvar = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ut;
  for (const f of HAR_DU_FRAGOR) {
    const p = (raw as Record<string, unknown>)[f.id] as Partial<HarDuPost> | undefined;
    if (p && typeof p === 'object' && typeof p.svar === 'string' && SVAR.includes(p.svar)) {
      ut[f.id] = { svar: p.svar as HarDuSvarVarde, av: typeof p.av === 'string' ? p.av : null, at: typeof p.at === 'string' ? p.at : '' };
    }
  }
  return ut;
}

/** Sätt ett svar (vem och när följer med). Samma svar en gång till = tillbaka till obesvarat (ett felklick ska gå att ta tillbaka). */
export function sattHarDu(svar: HarDuSvar, id: HarDuId, varde: HarDuSvarVarde, av: string | null, nu: string): HarDuSvar {
  const ut: HarDuSvar = { ...svar };
  if (ut[id]?.svar === varde) delete ut[id];
  else ut[id] = { svar: varde, av, at: nu };
  return ut;
}

// ── Varningar under frågorna ─────────────────────────────────────────────────────────────────────────────────────────

export interface VarningsIndata {
  /** kartans markeringar (typ = symbolens id: powerline, culturemonument …) */
  markeringar: ReadonlyArray<{ slag: string; typ: string; namn?: string }>;
  /** trakt_data.beraknad.restriktioner (tract-analysis): type = fornlamning | nyckelbiotop | biotopskydd | naturreservat | natura2000 | vattenskydd */
  restriktioner: ReadonlyArray<{ type?: string; name?: string }>;
  /** antal hänsynsytor ur Vidas traktgeometri */
  hansynsytor: number;
}

export interface Varning { fraga: HarDuId; text: string }

const NATUR_TYPER = ['nyckelbiotop', 'biotopskydd', 'naturreservat', 'natura2000'];
const KULTUR_SYMBOLER = ['culturemonument', 'culturestump'];

/** Det appen redan vet och som planeraren borde ha i huvudet när frågan besvaras. Frågan ställs även när inget finns att varna för. */
export function harDuVarningar(i: VarningsIndata): Varning[] {
  const ut: Varning[] = [];
  const namnLista = (ns: Array<string | undefined>) => {
    const u = Array.from(new Set(ns.map((n) => (n ?? '').trim()).filter(Boolean)));
    return u.length > 0 ? `: ${u.slice(0, 3).join(', ')}${u.length > 3 ? ' …' : ''}` : '';
  };

  const natur = i.restriktioner.filter((r) => NATUR_TYPER.includes(String(r.type)));
  if (natur.length > 0) ut.push({ fraga: 'naturvarden', text: `${natur.length === 1 ? 'Nyckelbiotop/skyddat område' : `${natur.length} skyddade områden`} registrerat${namnLista(natur.map((r) => r.name))}` });
  if (i.hansynsytor > 0) ut.push({ fraga: 'naturvarden', text: `${i.hansynsytor === 1 ? '1 hänsynsyta' : `${i.hansynsytor} hänsynsytor`} i Vidas underlag` });

  const forn = i.restriktioner.filter((r) => r.type === 'fornlamning');
  const kulturSymboler = i.markeringar.filter((m) => m.slag === 'symbol' && KULTUR_SYMBOLER.includes(m.typ)).length;
  if (forn.length > 0) ut.push({ fraga: 'kulturlamningar', text: `Registrerad fornlämning${namnLista(forn.map((r) => r.name))}` });
  if (kulturSymboler > 0) ut.push({ fraga: 'kulturlamningar', text: `${kulturSymboler === 1 ? '1 kulturmarkering' : `${kulturSymboler} kulturmarkeringar`} på kartan` });

  const ledn = i.markeringar.filter((m) => m.slag === 'symbol' && m.typ === 'powerline').length;
  if (ledn > 0) ut.push({ fraga: 'ledningar', text: ledn === 1 ? '1 el-ledning markerad på kartan' : `${ledn} el-ledningar markerade på kartan` });
  return ut;
}

// ── Utförare (skördare / skotare) ────────────────────────────────────────────────────────────────────────────────────

export interface UtforareVal {
  maskinId: string | null;
  /** 'egen' | 'extern' | null (kolumnen skordare_utforare / skotare_utforare) */
  utforare: string | null;
  externNamn: string;
}

export type UtforareLage = 'egen' | 'extern' | 'saknas';
/** Egen = en vald maskin. Extern = ett namn. Allt annat (inklusive "egen" utan maskin, "extern" utan namn) saknar svar. */
export function utforareLage(u: UtforareVal): UtforareLage {
  if (u.maskinId) return 'egen';
  if (u.utforare === 'extern' && u.externNamn.trim()) return 'extern';
  return 'saknas';
}

/**
 * Förvalet för skördare/skotare: vi kör själva i de flesta fall, så raden ska vara ifylld med EGEN maskin utan att någon trycker.
 * Källan är planeringen — maskinkön (`maskin_ko`: vilken maskins kö trakten ligger i). Hittas ingen där gäller den enda valbara
 * maskinen för rollen om det bara finns en. Annars (flera möjliga och ingen som planerats, eller kön gick inte att läsa) finns inget
 * ärligt förval: null, och raden är kvar (orange). Appen gissar aldrig mellan två maskiner.
 *   koMaskiner  = maskin-id:n vars kö innehåller trakten; null = kön gick inte att läsa
 *   valbara     = maskinerna som passar rollen (rätt typ, aktiva, klarar trakttypen)
 */
export function standardMaskin(koMaskiner: string[] | null, valbara: string[]): string | null {
  if (koMaskiner) {
    const iKo = Array.from(new Set(koMaskiner.filter((id) => valbara.includes(id))));
    if (iKo.length === 1) return iKo[0];
    if (iKo.length > 1) return null;   // trakten ligger i två maskiners köer — planeringen säger inte vilken
  }
  // Kön ej läst eller trakten saknas där: bara EN valbar maskin är ett ärligt förval.
  return valbara.length === 1 ? valbara[0] : null;
}

/**
 * Det som gäller för raden: det SPARADE svaret om någon tagit ställning (en maskin, eller Extern), annars förvalet. Extern utan namn är
 * ett val som ska fyllas i — det skrivs aldrig över av förvalet.
 */
export function medStandardMaskin(sparat: UtforareVal, standard: string | null): UtforareVal {
  if (sparat.maskinId || sparat.utforare === 'extern' || !standard) return sparat;
  return { maskinId: standard, utforare: null, externNamn: '' };
}

// ── Prognos ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PrognosIndata {
  skordareTimmar: number | null;
  skotareTimmar: number | null;
  volym: number | null;
  medelstam: number | null;
  areal: number | null;
  /** förutsättningar som påverkar tiden */
  bandSkordare: boolean | null;
  bandSkotare: boolean | null;
  breddat: boolean;
  skotningsavstand: string | null;
  barighet: string | null;
  terrang: string | null;
  basvagKravs: boolean | null;
  basvagTimmar: number | null;
  skordare: UtforareVal;
  skotare: UtforareVal;
}

/**
 * Fingeravtryck av allt prognosen vilar på. "Stämmer" sparar det; ändras något av underlaget stämmer det inte längre och
 * godkännandet gäller inte — utan att något behöver nollställas i databasen.
 */
export function prognosUnderlag(p: PrognosIndata): string {
  const n = (v: number | null) => (v == null ? '-' : String(v));
  const b = (v: boolean | null) => (v == null ? '-' : v ? '1' : '0');
  const u = (x: UtforareVal) => `${x.maskinId ?? ''}/${x.utforare ?? ''}/${x.utforare === 'extern' ? x.externNamn.trim() : ''}`;
  return [
    n(p.skordareTimmar), n(p.skotareTimmar), n(p.volym), n(p.medelstam), n(p.areal),
    b(p.bandSkordare), b(p.bandSkotare), b(p.breddat), p.skotningsavstand ?? '-', p.barighet ?? '-', p.terrang ?? '-',
    b(p.basvagKravs), n(p.basvagTimmar), u(p.skordare), u(p.skotare),
  ].join('|');
}

export type PrognosLage =
  | { lage: 'extern' }                                   // båda utförarna externa: ingen prognos behövs
  | { lage: 'godkand' }
  | { lage: 'ogodkand'; saknas: string[] };              // saknas = det som hindrar "Stämmer" ([] = allt finns, väntar bara på ett tryck)

/** Prognosens läge. `godkandUnderlag` = det fingeravtryck som sparades vid "Stämmer" (null = aldrig godkänd). */
export function prognosLage(p: PrognosIndata, godkandUnderlag: string | null): PrognosLage {
  const sk = utforareLage(p.skordare);
  const st = utforareLage(p.skotare);
  if (sk === 'extern' && st === 'extern') return { lage: 'extern' };
  const saknas: string[] = [];
  if (p.volym == null || p.volym <= 0) saknas.push('volym');
  // Medelstam hindrar INTE Stämmer: saknas den räknar förslaget snitt över alla trakter av typen (kortet säger det under tabellen). Medelstam är en egen post.
  if (sk === 'saknas') saknas.push('skördare');
  if (st === 'saknas') saknas.push('skotare');
  if (sk === 'egen' && (p.skordareTimmar == null || p.skordareTimmar <= 0)) saknas.push('skördartimmar');
  if (st === 'egen' && (p.skotareTimmar == null || p.skotareTimmar <= 0)) saknas.push('skotartimmar');
  if (saknas.length === 0 && godkandUnderlag != null && godkandUnderlag === prognosUnderlag(p)) return { lage: 'godkand' };
  return { lage: 'ogodkand', saknas };
}

// ── Ved ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type VedLangd = '3m' | 'fallande' | 'annan';
export type VedSortiment = 'bjork' | 'lov' | 'energi';
export const VED_SORTIMENT: ReadonlyArray<{ id: VedSortiment; namn: string }> = [
  { id: 'bjork', namn: 'Björk' }, { id: 'lov', namn: 'Allt löv' }, { id: 'energi', namn: 'Energi' },
];
export const VED_LANGD: ReadonlyArray<{ id: VedLangd; namn: string }> = [
  { id: '3m', namn: '3 m' }, { id: 'fallande', namn: 'Fallande' }, { id: 'annan', namn: 'Annan' },
];

export interface VedDetaljer {
  plats: 'avlagg' | 'karta';
  lat: number | null;
  lng: number | null;
  langd: VedLangd | null;
  langdAnnan: string;
  sortiment: VedSortiment[];
  ovrigt: string;
  /** markeringen på kartan som föraren ser (när plats = karta) */
  markeringId: string | null;
}

export const VED_TOM: VedDetaljer = { plats: 'avlagg', lat: null, lng: null, langd: null, langdAnnan: '', sortiment: [], ovrigt: '', markeringId: null };

export function lasVed(raw: unknown): VedDetaljer {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...VED_TOM };
  const r = raw as Record<string, unknown>;
  const tal = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    plats: r.plats === 'karta' ? 'karta' : 'avlagg',
    lat: tal(r.lat), lng: tal(r.lng),
    langd: r.langd === '3m' || r.langd === 'fallande' || r.langd === 'annan' ? r.langd : null,
    langdAnnan: typeof r.langd_annan === 'string' ? r.langd_annan : '',
    sortiment: Array.isArray(r.sortiment) ? r.sortiment.filter((s): s is VedSortiment => s === 'bjork' || s === 'lov' || s === 'energi') : [],
    ovrigt: typeof r.ovrigt === 'string' ? r.ovrigt : '',
    markeringId: typeof r.markering_id === 'string' ? r.markering_id : null,
  };
}

/** Kolumnformen (snake_case) som sparas i objekt.ved_detaljer. */
export function vedTillKolumn(v: VedDetaljer): Record<string, unknown> {
  return { plats: v.plats, lat: v.lat, lng: v.lng, langd: v.langd, langd_annan: v.langdAnnan || null, sortiment: v.sortiment, ovrigt: v.ovrigt || null, markering_id: v.markeringId };
}

/** "Ved: 3 m · Björk, Allt löv · vid avlägget · vid ladan". Det som är ifyllt, i den ordningen — aldrig ett tomt streck. */
export function vedSammanfattning(v: VedDetaljer): string {
  const langd = v.langd === 'annan' ? (v.langdAnnan.trim() || 'annan längd') : VED_LANGD.find((l) => l.id === v.langd)?.namn.replace(/^F/, 'f') ?? '';
  const sort = VED_SORTIMENT.filter((s) => v.sortiment.includes(s.id)).map((s) => s.namn).join(', ');
  const plats = v.plats === 'karta' ? (v.markeringId ? 'markerad på kartan' : '') : 'vid avlägget';
  return ['Ved:', [langd, sort, plats, v.ovrigt.trim()].filter(Boolean).join(' · ') || 'ska ha ved'].join(' ');
}

// ── Allt ihop: vad är kvar? ──────────────────────────────────────────────────────────────────────────────────────────

/** Har Vidas traktgeometri en basväg? (linje vars beskrivning nämner basväg) */
export function vidaBasvagFinns(features: ReadonlyArray<{ properties?: Record<string, unknown> | null } | null | undefined> | null | undefined): boolean {
  return (features ?? []).some((f) => f?.properties?._typ === 'linje' && /basväg/i.test(String(f.properties.FLBESKR ?? '')));
}

// ── Vidas avlägg ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Vidas avlägg kommer ur objekt_geometri.geometri (GeoJSON): punkter i lagret L_TILLAGGSPUNKTER (`_typ: 'punkt'`), numret i EXTRA_LABE (reserv LOPNR),
// beskrivningen i FLBESKR. Samma lager bär larmpunkten (FLBESKR "Larmkoordinat") — den är inget avlägg.

type GeoFeatureLik = { properties?: Record<string, unknown> | null; geometry?: { type?: string; coordinates?: unknown } | null } | null | undefined;

export interface VidaAvlagg { nummer: string; lat: number | null; lng: number | null }

/** Vidas avlägg i traktgeometrin, i nummerordning ("01-2" före "01-10"). Tom lista = Vida har inga. */
export function vidaAvlaggUr(features: ReadonlyArray<GeoFeatureLik> | null | undefined): VidaAvlagg[] {
  const ut: VidaAvlagg[] = [];
  for (const f of features ?? []) {
    const p = f?.properties;
    if (!p || p._typ !== 'punkt') continue;
    if (/larm/i.test(String(p.FLBESKR ?? ''))) continue;
    const c = f?.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates) ? (f.geometry.coordinates as unknown[]) : null;
    const lng = c && typeof c[0] === 'number' ? c[0] : null;
    const lat = c && typeof c[1] === 'number' ? c[1] : null;
    const nr = String(p.EXTRA_LABE ?? '').trim() || String(p.LOPNR ?? '').trim();
    ut.push({ nummer: nr, lat, lng });
  }
  ut.sort((a, b) => a.nummer.localeCompare(b.nummer, 'sv', { numeric: true }));
  return ut.map((a, k) => (a.nummer ? a : { ...a, nummer: `Avlägg ${k + 1}` }));
}

/** Planerarens "Stämmer" för Vidas avlägg: vilka nummer som bekräftades, av vem och när. Bor i objekt.har_du_svar under nyckeln `vida_avlagg` (ingen ny kolumn). */
export interface VidaAvlaggBekraftelse { nummer: string[]; av: string | null; at: string }

export function lasVidaAvlagg(raw: unknown): VidaAvlaggBekraftelse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>).vida_avlagg;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.nummer) || typeof o.at !== 'string') return null;
  return { nummer: o.nummer.map(String), av: typeof o.av === 'string' ? o.av : null, at: o.at };
}

/** Bekräftelsen gäller bara exakt de avlägg som visades: levererar Vida nya eller färre avlägg måste planeraren titta igen. */
export function vidaAvlaggBekraftat(nummer: readonly string[], bek: VidaAvlaggBekraftelse | null): boolean {
  if (!bek || nummer.length === 0) return false;
  const a = [...nummer].sort(); const b = [...bek.nummer].sort();
  return a.length === b.length && a.every((x, k) => x === b[k]);
}

export type PostId = 'avlagg' | 'basvag' | 'barighet' | 'terrang' | 'skotningsavstand' | 'skordare' | 'skotare' | 'medelstam' | 'prognos';

export interface Post {
  id: PostId;
  etikett: string;
  /** texten raden visar; null = inget värde (orange rad med uppmaning) */
  varde: string | null;
  kvar: boolean;
}

export interface KlarIndata {
  avlaggAntal: number;
  /** Vidas avlägg (nummer) ur traktgeometrin — saknas/tom = Vida har inga */
  vidaAvlagg?: string[];
  /** planeraren har tryckt Stämmer på exakt de här avläggen */
  vidaAvlaggBekraftat?: boolean;
  /** basvägslinjerna ("Röd 640 m") i den ordning de ritats — redan formaterade av anroparen */
  basvagTexter: string[];
  /** Vidas underlag (traktgeometrin) har en basväg — då är den kvar tills den ritats i appen. false = ingen basväg väntas: "Ingen" är klart. */
  basvagForvantad: boolean;
  basvagKravs: boolean | null;
  barighet: string | null;
  terrang: string | null;
  skotningsavstand: string | null;
  skordare: UtforareVal;
  skotare: UtforareVal;
  prognos: PrognosIndata;
  prognosGodkandUnderlag: string | null;
  harDu: HarDuSvar;
}

export interface KlarStatus {
  poster: Post[];
  prognos: PrognosLage;
  /** obesvarade "Har du…"-frågor, i frågornas ordning */
  frågorKvar: HarDuId[];
  /** hur många av bärighet, terräng och skotningsavstånd som saknas (0–3): Förutsättningar är ETT område i kortet */
  forutsattningarKvar: number;
  /** hur många av skördare och skotare som saknas (0–2): Maskiner är ETT område */
  maskinerKvar: number;
  /** antal OMRÅDEN som är kvar (inte antal fält) = antal steg i "Gå igenom": avlägg, basväg, Förutsättningar (bärighet + terräng + skotningsavstånd = ett), Maskiner (skördare + skotare = ett), medelstam, Har du … (alla sex frågorna = ett), prognos */
  antalKvar: number;
  klar: boolean;
}

const BARIGHET: Record<string, string> = { bra: 'Bra', medel: 'Medel', dalig: 'Dålig' };
const TERRANG: Record<string, string> = { flackt: 'Flack', kuperat: 'Kuperad', brant: 'Brant' };
const SKOTAVST: Record<string, string> = { kort: 'Kort', medel: 'Medel', langt: 'Långt' };
export const BARIGHET_VAL = [{ id: 'bra', namn: 'Bra' }, { id: 'medel', namn: 'Medel' }, { id: 'dalig', namn: 'Dålig' }] as const;
export const TERRANG_VAL = [{ id: 'flackt', namn: 'Flack' }, { id: 'kuperat', namn: 'Kuperad' }, { id: 'brant', namn: 'Brant' }] as const;
export const SKOTNINGSAVSTAND_VAL = [{ id: 'kort', namn: 'Kort' }, { id: 'medel', namn: 'Medel' }, { id: 'langt', namn: 'Långt' }] as const;

/** De tre posterna som kortet visar som ETT område, Förutsättningar. */
export const FORUTSATTNING_IDS: readonly PostId[] = ['barighet', 'terrang', 'skotningsavstand'];
/** Skördare och skotare = ett område, Maskiner. */
export const MASKIN_IDS: readonly PostId[] = ['skordare', 'skotare'];

/** Avläggen i ord, utan nummer (numren står bara som etiketter på kartan): "2 från Vida", "2 från Vida + 1 eget", "eget", "3 egna". Tomt när inga finns. */
export function avlaggText(vida: number, eget: number): string {
  const egna = eget === 1 ? '1 eget' : `${eget} egna`;
  if (vida > 0) return eget > 0 ? `${vida} från Vida + ${egna}` : `${vida} från Vida`;
  return eget > 0 ? (eget === 1 ? 'eget' : egna) : '';
}

/** Frågan om Vidas avlägg, på kartan och i steget: ordlydelsen är planerarens, utan nummer. */
export function vidaAvlaggFraga(n: number): { text: string; ja: string } {
  return n === 1
    ? { text: 'Vida har lagt 1 avlägg. Ligger det rätt?', ja: 'Ja, det ligger rätt' }
    : { text: `Vida har lagt ${n} avlägg. Ligger de rätt?`, ja: 'Ja, de ligger rätt' };
}

/** Avlägg: finns Vidas avlägg räknas de när planeraren bekräftat dem (eller själv placerat ett eget); annars räcker ett eget på kartan. */
function avlaggPost(i: KlarIndata): Post {
  const vida = i.vidaAvlagg ?? [];
  if (vida.length === 0) return { id: 'avlagg', etikett: 'Avlägg', varde: i.avlaggAntal > 0 ? (i.avlaggAntal === 1 ? '1 avlägg på kartan' : `${i.avlaggAntal} avlägg på kartan`) : null, kvar: i.avlaggAntal === 0 };
  const klart = !!i.vidaAvlaggBekraftat || i.avlaggAntal > 0;
  return { id: 'avlagg', etikett: 'Avlägg', varde: klart ? avlaggText(vida.length, i.avlaggAntal) : null, kvar: !klart };
}

export function berakna(i: KlarIndata): KlarStatus {
  const sk = utforareLage(i.skordare);
  const st = utforareLage(i.skotare);
  const prognos = prognosLage(i.prognos, i.prognosGodkandUnderlag);

  const poster: Post[] = [
    avlaggPost(i),
    // Basväg: kvar bara om Vida har en och ingen är ritad. Ingen väntad basväg + ingen ritad = "Ingen" = klart.
    { id: 'basvag', etikett: 'Basväg', varde: i.basvagTexter.length > 0 ? i.basvagTexter.join(' · ') : i.basvagForvantad ? null : 'Ingen', kvar: i.basvagTexter.length === 0 && i.basvagForvantad },
    { id: 'barighet', etikett: 'Bärighet', varde: i.barighet ? (BARIGHET[i.barighet] ?? i.barighet) : null, kvar: !i.barighet },
    { id: 'terrang', etikett: 'Terräng', varde: i.terrang ? (TERRANG[i.terrang] ?? i.terrang) : null, kvar: !i.terrang },
    { id: 'skotningsavstand', etikett: 'Skotningsavstånd', varde: i.skotningsavstand ? (SKOTAVST[i.skotningsavstand] ?? i.skotningsavstand) : null, kvar: !i.skotningsavstand },
    { id: 'skordare', etikett: 'Skördare', varde: sk === 'egen' ? 'Egen' : sk === 'extern' ? `Extern · ${i.skordare.externNamn.trim()}` : null, kvar: sk === 'saknas' },
    { id: 'skotare', etikett: 'Skotare', varde: st === 'egen' ? 'Egen' : st === 'extern' ? `Extern · ${i.skotare.externNamn.trim()}` : null, kvar: st === 'saknas' },
    // Medelstam styr G15-förslaget för skördaren. Saknas den (ingen TD-träff, inget skrivet) är raden kvar — förslaget faller då tillbaka på snitt över alla trakter.
    { id: 'medelstam', etikett: 'Medelstam', varde: i.prognos.medelstam != null && i.prognos.medelstam > 0 ? `${String(i.prognos.medelstam).replace('.', ',')} m³fub` : null, kvar: !(i.prognos.medelstam != null && i.prognos.medelstam > 0) },
    { id: 'prognos', etikett: 'Prognos', varde: prognos.lage === 'extern' ? 'Extern – ingen prognos' : prognos.lage === 'godkand' ? 'Stämmer' : null, kvar: prognos.lage === 'ogodkand' },
  ];

  const frågorKvar = HAR_DU_FRAGOR.filter((f) => !i.harDu[f.id]).map((f) => f.id);
  const forutsattningarKvar = poster.filter((x) => FORUTSATTNING_IDS.includes(x.id) && x.kvar).length;
  const maskinerKvar = poster.filter((x) => MASKIN_IDS.includes(x.id) && x.kvar).length;
  // Antalet räknas per OMRÅDE (= ett steg i "Gå igenom"): de tre förutsättningarna är ett, skördare + skotare är ett, och de sex frågorna är ett. Samma tal står i rubriken, i namnfältets chip och i objektlistan.
  const omraden = poster.filter((x) => x.kvar && !FORUTSATTNING_IDS.includes(x.id) && !MASKIN_IDS.includes(x.id)).length + (forutsattningarKvar > 0 ? 1 : 0) + (maskinerKvar > 0 ? 1 : 0) + (frågorKvar.length > 0 ? 1 : 0);
  return { poster, prognos, frågorKvar, forutsattningarKvar, maskinerKvar, antalKvar: omraden, klar: omraden === 0 };
}

// ── Chippen i namnfältet och i listorna ──────────────────────────────────────────────────────────────────────────────

export interface KvarChip { text: string; ton: 'orange' | 'gron' | 'neutral' }

/**
 * "3 kvar" (orange), "Redo att skicka" (neutral — allt är ifyllt men trakten har inte gått till maskin) eller "Klar" (grön — bara när trakten ÄR skickad,
 * dvs. klar_skickad_timestamp finns). Ord och färg tillsammans. null = inget att visa.
 */
export function kvarChip(antalKvar: number | null | undefined, skickad = false): KvarChip | null {
  if (antalKvar == null || !Number.isFinite(antalKvar)) return null;
  if (antalKvar > 0) return { text: `${antalKvar} kvar`, ton: 'orange' };
  return skickad ? { text: 'Klar', ton: 'gron' } : { text: 'Redo att skicka', ton: 'neutral' };
}

/**
 * Radens text i objektlistorna för en oplanerad trakt: "N kvar" när kortet beräknat det, "Redo att skicka" när allt är ifyllt (0 kvar) men trakten inte skickats,
 * annars ärligt "Inte klarplanerad" (ingen siffra beräknad — aldrig en gissad).
 */
export function oplaneradRadText(antalKvar: number | null | undefined): string {
  if (typeof antalKvar !== 'number' || !Number.isFinite(antalKvar)) return 'Inte klarplanerad';
  return antalKvar > 0 ? `${antalKvar} kvar` : 'Redo att skicka';
}

/** Kvittot efter att något ritats/placerats får " · N kvar" under planeringen (och ingenting annars). */
export function kvittoMedKvar(text: string, antalKvar: number | null | undefined, underPlanering: boolean): string {
  if (!underPlanering || antalKvar == null || antalKvar <= 0) return text;
  return `${text} · ${antalKvar} kvar`;
}

// ── Förarens sammanfattning ──────────────────────────────────────────────────────────────────────────────────────────

export interface SammanfattningRad { id: string; etikett: string; text: string }

export interface SammanfattningIndata {
  avlaggAntal: number;
  vidaAvlagg?: string[];
  basvagTexter: string[];
  basvagKravs: boolean | null;
  barighet: string | null;
  terrang: string | null;
  skotningsavstand: string | null;
  bandSkordare: boolean | null;
  bandSkotare: boolean | null;
  bandParSkordare: string | null;
  bandParSkotare: string | null;
  breddat: boolean;
  konfiguration: string | null;
  risDirekt: boolean;
  extraVagn: boolean;
  trailerIn: boolean;
  trailerKommentar: string;
  manuellFallning: boolean;
  manuellFallningText: string;
  ved: boolean;
  vedDetaljer: VedDetaljer;
  vedText: string;
  harDu: HarDuSvar;
}

/** Det föraren får se: det planeraren fyllt i, utan Klar-knapp och utan att kunna ändra. Bara det som har ett värde — aldrig "Nej" på varje rad. */
export function forarSammanfattning(i: SammanfattningIndata): SammanfattningRad[] {
  const ut: SammanfattningRad[] = [];
  const rad = (id: string, etikett: string, text: string | null | undefined) => { if (text) ut.push({ id, etikett, text }); };
  const vidaN = (i.vidaAvlagg ?? []).length;
  rad('avlagg', 'Avlägg', vidaN > 0 ? avlaggText(vidaN, i.avlaggAntal) : i.avlaggAntal > 0 ? (i.avlaggAntal === 1 ? '1 på kartan' : `${i.avlaggAntal} på kartan`) : null);
  rad('basvag', 'Basväg', i.basvagTexter.length > 0 ? i.basvagTexter.join(' · ') : null);
  if (i.basvagKravs) rad('basvagsanlaggning', 'Basvägsanläggning', 'Krävs');
  rad('barighet', 'Bärighet', i.barighet ? BARIGHET[i.barighet] ?? i.barighet : null);
  rad('terrang', 'Terräng', i.terrang ? TERRANG[i.terrang] ?? i.terrang : null);
  rad('skotningsavstand', 'Skotningsavstånd', i.skotningsavstand ? SKOTAVST[i.skotningsavstand] ?? i.skotningsavstand : null);
  if (i.bandSkordare) rad('band-skordare', 'Band skördare', i.bandParSkordare ? `Ja · ${i.bandParSkordare} par` : 'Ja');
  if (i.bandSkotare) rad('band-skotare', 'Band skotare', i.bandParSkotare ? `Ja · ${i.bandParSkotare} par` : 'Ja');
  if (i.breddat) rad('breddat', 'Breddat lastrede', 'Ja');
  if (i.konfiguration) rad('konfiguration', 'Konfiguration', i.konfiguration === 'smal' ? 'Smal' : 'Bred');
  if (i.risDirekt) rad('ris', 'Ris', 'Skotas direkt');
  if (i.extraVagn) rad('vagn', 'Extra vagn', 'Ja');
  if (!i.trailerIn) rad('trailer', 'Trailer', i.trailerKommentar.trim() ? `Kan inte köra in · ${i.trailerKommentar.trim()}` : 'Kan inte köra in');
  if (i.manuellFallning) rad('manuell', 'Manuell fällning', i.manuellFallningText.trim() || 'Ja');
  if (i.ved) rad('ved', 'Ved till markägaren', i.vedText.replace(/^Ved:\s*/, ''));
  // Svar som är en varning för föraren: bara de som säger att något FINNS eller GJORTS ska läsas — "Inga hittade" är ingen uppgift att visa.
  if (i.harDu.avlagg_hugga?.svar === 'ja') rad('avlagg-hugga', 'Avlägget', 'Ska huggas');
  if (i.harDu.snitslat?.svar === 'ja') rad('snitslat', 'Basvägen', 'Snitslad');
  return ut;
}
