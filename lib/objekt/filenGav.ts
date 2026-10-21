// "Vad filen gav oss": traktfilens innehåll, översatt till vad det BETYDER. All data finns redan sparad av importen — inget här skrivs till
// importflödet. Tre källor på objektraden/geometrin:
//   • import_varningar (jsonb: {nyckel, sort, text}, äldre rader ren text) → frågorna, via lib/trakt/varningar,
//   • dokumentkolumnerna (traktdirektiv_url, traktkarta_url/traktkartor, stamplingslangd_url, valtlapp_url, ovriga_dokument),
//   • objekt_geometri.geometri (GeoJSON med _typ/_lager/FLBESKR och SHAPE.STAr/STLe) → hänsyn, basväg, kraftledning, avlägg.
//
// Saknas något står det: "Ingen stämplingslängd i filen" är information, en tom rad är det inte.

import { ORIMLIG_VOLYM_NYCKEL, orimligVolymText } from '@/lib/trakt/rimlighet';
import { tillVarningar, VOLYM_BEHALLEN_NYCKEL } from '@/lib/trakt/varningar';
import { avvikelseText, jamfor } from './stamplingslangd';
import { arRotpost } from './rotpost';
import { AVVIKANDE_UTFALL_NYCKEL, arAvslutat, avvikandeUtfall } from './utfall';

const sv = (n: number) => Math.round(n).toLocaleString('sv-SE');

// ---------------------------------------------------------------------------
// Frågorna (import_varningar)
// ---------------------------------------------------------------------------
// Importen ger varje rad en sort (lib/trakt/varningar.ts). Vyn visar bara `fraga` — det som kräver en människa. `noterat` ligger hopfällt,
// `utveckling` visas inte alls. Okänd PDF och osäker stämplingslängd är SAMMA fråga: "vad är den här PDF:en?".

export interface Fraga {
  nyckel: string;
  fil: string;
  /** Importen fick en ledtråd: Info nämnde en stämplingslängd, så den här PDF:en tolkades som det. */
  nannderStamplingslangd: boolean;
  /** Var filen ligger i bucketen (null = hittades inte bland objektets dokument). */
  path: string | null;
}

/** En fråga per fil. Dubbletter (samma fil nämnd av två regler) slås ihop. */
export function fragor(varningar: unknown, dok: Pick<DokKolumner, 'stamplingslangd_url' | 'ovriga_dokument'>): Fraga[] {
  const sett = new Set<string>();
  const ut: Fraga[] = [];
  for (const v of tillVarningar(varningar)) {
    if (v.sort !== 'fraga' || !v.fil || sett.has(v.nyckel)) continue;
    sett.add(v.nyckel);
    const ledtrad = v.ledtrad === 'info_namnde_stamplingslangd';
    const bland = (dok.ovriga_dokument ?? []).find(d => d.namn === v.fil)?.path ?? null;
    ut.push({ nyckel: v.nyckel, fil: v.fil, nannderStamplingslangd: ledtrad, path: ledtrad ? (dok.stamplingslangd_url ?? bland) : bland });
  }
  return ut;
}

// ---------------------------------------------------------------------------
// Frågorna om volymen (härledda vid läsning — aldrig lagrade)
// ---------------------------------------------------------------------------
// Volymen jämförs med arealen (m³fub/ha) och med stämplingslängdens tal. Frågorna räknas ur objektets nuvarande värden varje gång en vy
// öppnas, så en rättad volym släcker dem av sig själv (en lagrad rad skulle ligga kvar tills nästa import). Till skillnad från PDF-frågorna
// gäller de ÄVEN avslutade objekt: en avslutad trakts volym ingår i beställningens täckning, och ett fel tal där ger fel läge i alla månader.

// ---------------------------------------------------------------------------
// Stämplingslängdens tre lägen (Martin 2026-10-20)
// ---------------------------------------------------------------------------
// En PDF som importen TOLKAT som stämplingslängd (ledtråd i Info, ingen igenkänd filnamn → "OSÄKER, bekräfta i UI:t") är en gissning, inte ett fynd.
// Prod 2026-10-20: av nio rotposter har fem en stamplingslangd_url. Fyra (Arvidstorp, Bågskyttebanan, Skälviken, Vällust) kommer ur en sådan
// gissning, ingen är bekräftad. Den femte, Åbogen, har import_varningar = null (kalla 'traktdirektiv', importerad innan kontrollerna fanns):
// inget sägs om hur PDF:en identifierades, och filnamnet bär ingen information — *_stamplingslangd.pdf är namnet importen SATT vid sparandet,
// inte originalnamnet. Att behandla en PDF utan spår som "funnen" tystade frågan på objekt där ingen människa läst papperet — och Bågskyttebanans
// 3 495 m³ (rätt: 1 687) stod i prod sedan augusti just därför.
//   bekraftad     = ett tal är inskrivet: en människa har läst stämplingslängden. Bara det tystar frågan.
//   gissad        = en PDF finns men importen gissade vad den är ("OSÄKER, bekräfta i UI:t"), och ingen har bekräftat.
//   okontrollerad = en PDF finns men inget sägs om hur den identifierades (ingen importlogg). Inte bekräftad, inte heller en känd gissning.
//   saknas        = varken PDF eller tal.
// Gissad och okontrollerad ställer frågan (utom på en avslutad trakt). Ett svar "ja, det stämmer" finns inte: det skulle skrivas över av nästa
// omimport (CLAUDE.md). Talet är bekräftelsen.
export type StamplingslangdLage = 'bekraftad' | 'gissad' | 'okontrollerad' | 'saknas';

export function stamplingslangdLage(o: {
  stamplingslangd_url?: string | null;
  stamplingslangd_volym?: number | null;
  import_varningar?: unknown;
}): StamplingslangdLage {
  if (o.stamplingslangd_volym != null && Number(o.stamplingslangd_volym) > 0) return 'bekraftad';
  if (!o.stamplingslangd_url) return 'saknas';
  return gissadPdf(o) ? 'gissad' : 'okontrollerad';
}

/** Importen tolkade den filen som stämplingslängd på en ledtråd och sa själv att den var osäker. */
function gissadPdf(o: { import_varningar?: unknown }) {
  return fragor(o.import_varningar, { stamplingslangd_url: null, ovriga_dokument: null }).find(f => f.nannderStamplingslangd) ?? null;
}

/**
 * Frågorna om filer som ska visas: som `fragor`, men på en rotpost ersätts den gissade stämplingslängden av volymfrågan `stamplingslangd_saknas`
 * (samma fil, EN fråga i stället för två) — och är talet inskrivet är gissningen avgjord av en människa och frågan om PDF:en faller.
 */
export function oppnaFragor(o: { avtalsform?: string | null; namn?: string | null; import_varningar?: unknown } & Pick<DokKolumner, 'stamplingslangd_url' | 'ovriga_dokument'>): Fraga[] {
  const alla = fragor(o.import_varningar, o);
  return arRotpost(o) ? alla.filter(f => !f.nannderStamplingslangd) : alla;
}

export interface VolymUnderlag {
  namn?: string | null;
  /** Rp = rotpost, Au = avverkningsuppdrag (lib/objekt/rotpost.ts). Fångas bara på nyimporterade objekt; annars avgör "RP" i namnet. */
  avtalsform?: string | null;
  stamplingslangd_url?: string | null;
  import_varningar?: unknown;
  typ: string | null;
  volym: number | null;
  areal?: number | null;
  stamplingslangd_volym?: number | null;
  stamplingslangd_enhet?: string | null;
  status?: string | null;
  /** Maskinernas utfall i m³fub (lib/objekt/utfall.ts). null/undefined = inget utfall. */
  utfall?: number | null;
}

export interface VolymFraga {
  nyckel: 'orimlig_volym' | 'avvikande_utfall' | 'stamplingslangd_avviker' | 'stamplingslangd_saknas' | 'volym_behallen';
  text: string;
  /** Bara `stamplingslangd_saknas` när PDF:en är en gissning: filen som tolkades, och var den ligger (så frågan kan erbjuda "Öppna filen"). */
  fil?: string;
  path?: string | null;
  /** Ett förslag på ny volym (m³fub) som en människa kan godkänna — bara när utfallet är slutgiltigt. Skrivs aldrig av sig självt. */
  forslagVolym?: number;
}

export function volymFragor(o: VolymUnderlag): VolymFraga[] {
  const ut: VolymFraga[] = [];
  const orimlig = orimligVolymText(o.typ, o.volym, o.areal);
  if (orimlig) ut.push({ nyckel: ORIMLIG_VOLYM_NYCKEL, text: orimlig });
  const utfall = avvikandeUtfall({ status: o.status ?? null, volym: o.volym, areal: o.areal ?? null, utfall: o.utfall });
  if (utfall) ut.push({ nyckel: AVVIKANDE_UTFALL_NYCKEL, text: utfall.text, ...(utfall.forslag != null ? { forslagVolym: utfall.forslag } : null) });
  // Omimporten lät en handrättad volym ligga kvar och filen hade ett annat tal. Frågan gäller så länge volymen skiljer sig från filens tal, och
  // ÄVEN ett avslutat objekt (volymen ingår i täckningen). Texten byggs live: rättas volymen till filens tal är frågan avgjord.
  const behallen = tillVarningar(o.import_varningar).find(v => v.nyckel === VOLYM_BEHALLEN_NYCKEL && typeof v.varde === 'number');
  if (behallen && o.volym != null && Math.round(Number(o.volym)) !== Math.round(behallen.varde!)) {
    ut.push({
      nyckel: 'volym_behallen',
      text: `Vida skickade ${sv(behallen.varde!)} m³fub vid senaste importen, men volymen är rättad för hand till ${sv(Number(o.volym))} m³fub. Din volym behölls. Gäller den fortfarande?`,
    });
  }
  // Stämplingslängd gäller bara en ROTPOST (avtalsformen avgör, inte typen). På ett avverkningsuppdrag finns inget att stämpla — ingen jämförelse, ingen fråga.
  if (arRotpost(o)) {
    const avviker = avvikelseText(o.volym, jamfor(o.volym, o.stamplingslangd_volym, o.stamplingslangd_enhet));
    if (avviker) ut.push({ nyckel: 'stamplingslangd_avviker', text: avviker });
    // Frågan ställs inte på en avslutad trakt: stämplingslängden är en uppskattning före avverkning och en obesvarad fråga betyder inget efteråt.
    // Raden och fältet finns kvar (FilenGavVy) — Bågskyttebanans fel hittades just så, genom att talet jämfördes efteråt.
    const lage = stamplingslangdLage(o);
    if (!arAvslutat(o.status) && lage !== 'bekraftad') {
      const gissad = lage === 'gissad' ? gissadPdf(o) : null;
      const okanda = fragor(o.import_varningar, { stamplingslangd_url: null, ovriga_dokument: null }).length;
      if (gissad) {
        ut.push({
          nyckel: 'stamplingslangd_saknas',
          text: `Det här är en rotpost och ska ha en stämplingslängd. Importen gissade att "${gissad.fil}" är den, men ingen har bekräftat det. Öppna filen och skriv in talet.`,
          fil: gissad.fil,
          path: o.stamplingslangd_url ?? null,
        });
      } else if (lage === 'okontrollerad') {
        ut.push({
          nyckel: 'stamplingslangd_saknas',
          text: 'Det här är en rotpost och ska ha en stämplingslängd. En PDF är sparad som den, men inget säger hur den identifierades och ingen har läst talet. Öppna filen och skriv in talet.',
          path: o.stamplingslangd_url ?? null,
        });
      } else {
        ut.push({
          nyckel: 'stamplingslangd_saknas',
          text: `Det här är en rotpost — virket säljs på rot och ska ha en stämplingslängd, men ingen är identifierad.${okanda > 0 ? ' En PDF i filen är oidentifierad (se frågan om den): kan det vara stämplingslängden?' : ''} Skriv in talet när du har det.`,
        });
      }
    }
  }
  return ut;
}

/** Det som är beslutat och bara för kännedom — visas hopfällt längst ner. Utvecklingsrader visas aldrig. */
export function noterat(varningar: unknown): string[] {
  return tillVarningar(varningar).filter(v => v.sort === 'noterat').map(v => v.text);
}

// ---------------------------------------------------------------------------
// Dokumenten
// ---------------------------------------------------------------------------

export interface DokKolumner {
  traktdirektiv_url: string | null;
  traktkarta_url: string | null;
  traktkartor: { namn: string; path: string; ordning?: number }[] | null;
  oversiktskarta_url: string | null;
  stamplingslangd_url: string | null;
  valtlapp_url: string | null;
  ovriga_dokument: { namn: string; path: string }[] | null;
}

/** Karta N blad: traktkartor (flera blad) eller den enda traktkarta_url (rader från före kolumnen) — samma sak i två format. */
export function traktkartor(o: Pick<DokKolumner, 'traktkartor' | 'traktkarta_url'>): { namn: string; path: string }[] {
  if (Array.isArray(o.traktkartor) && o.traktkartor.length > 0) {
    return [...o.traktkartor].sort((a, b) => (a.ordning ?? 0) - (b.ordning ?? 0)).map(k => ({ namn: k.namn, path: k.path }));
  }
  return o.traktkarta_url ? [{ namn: 'Traktkarta', path: o.traktkarta_url }] : [];
}

export const bladText = (n: number): string => (n === 1 ? '1 blad' : `${n} blad`);

// ---------------------------------------------------------------------------
// Geometrin
// ---------------------------------------------------------------------------

export interface GeoSammanfattning {
  hansyn: { antal: number; ha: number; beskrivningar: string[] } | null;
  basvag: { antal: number; meter: number } | null;
  /** Risker i marken, ritade som linjer (kraftledning). Det är inte en fil — det är en fara. */
  faror: { namn: string; meter: number }[];
  andraLinjer: { namn: string; meter: number }[];
  avlagg: number;
}

const FARA_LINJE = /kraftled|ledning|högspänn/i;
const BASVAG = /bas\s?v[aä]g/i;

function tal(v: unknown): number {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** SHAPE.STAr / SHAPE.STLe ligger i attributen (m² resp. m). */
function attr(p: Record<string, unknown>, re: RegExp): number {
  const k = Object.keys(p).find(x => re.test(x));
  return k ? tal(p[k]) : 0;
}

export function geometriSammanfattning(fc: unknown): GeoSammanfattning | null {
  const features = (fc as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;

  let hansynM2 = 0, hansynAntal = 0;
  const beskr: string[] = [];
  let basM = 0, basAntal = 0;
  const faror = new Map<string, number>();
  const andra = new Map<string, number>();
  let avlagg = 0;

  for (const f of features) {
    const p = ((f as { properties?: Record<string, unknown> })?.properties ?? {}) as Record<string, unknown>;
    const typ = String(p._typ ?? '');
    const text = String(p.FLBESKR ?? '').trim();
    if (typ === 'hänsynsyta') {
      hansynAntal++;
      hansynM2 += attr(p, /star/i);
      if (text && !beskr.includes(text)) beskr.push(text);
    } else if (typ === 'linje') {
      const m = attr(p, /stle/i);
      if (FARA_LINJE.test(text)) faror.set(text, (faror.get(text) ?? 0) + m);
      else if (BASVAG.test(text)) { basAntal++; basM += m; }
      else andra.set(text || 'Linje', (andra.get(text || 'Linje') ?? 0) + m);
    } else if (typ === 'punkt' && !/larm/i.test(text)) {
      avlagg++;
    }
  }

  return {
    hansyn: hansynAntal > 0 ? { antal: hansynAntal, ha: hansynM2 / 10000, beskrivningar: beskr } : null,
    basvag: basAntal > 0 ? { antal: basAntal, meter: Math.round(basM) } : null,
    faror: Array.from(faror, ([namn, m]) => ({ namn, meter: Math.round(m) })),
    andraLinjer: Array.from(andra, ([namn, m]) => ({ namn, meter: Math.round(m) })),
    avlagg,
  };
}

export const fmtHa = (ha: number): string => ha.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtAreal = fmtHa;

// ---------------------------------------------------------------------------
// Certifiering (CLAUDE.md, körvyns krav: kolumnen är fri text med sex värden)
// ---------------------------------------------------------------------------

/** Certifierat = nämner FSC eller PEFC. "None"/"Ej certifierad" är ej certifierat; "Not known"/tomt är okänt. */
export function certText(cert: string | null | undefined): string {
  const c = (cert ?? '').trim();
  if (!c) return 'Saknas i filen';
  if (/fsc|pefc/i.test(c)) return c;
  if (/^(none|ej certifierad)$/i.test(c)) return 'Ej certifierad';
  return 'Inte känt';
}
