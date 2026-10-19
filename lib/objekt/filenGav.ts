// "Vad filen gav oss": traktfilens innehåll, översatt till vad det BETYDER. All data finns redan sparad av importen — inget här skrivs till
// importflödet. Tre källor på objektraden/geometrin:
//   • import_varningar (jsonb, ALLTID text[] — inte strukturerad) → det osäkra, tolkat med mönster nedan,
//   • dokumentkolumnerna (traktdirektiv_url, traktkarta_url/traktkartor, stamplingslangd_url, valtlapp_url, ovriga_dokument),
//   • objekt_geometri.geometri (GeoJSON med _typ/_lager/FLBESKR och SHAPE.STAr/STLe) → hänsyn, basväg, kraftledning, avlägg.
//
// Saknas något står det: "Ingen stämplingslängd i filen" är information, en tom rad är det inte.

import { BEKRAFTAD_STAMPLINGSLANGD, OSAKER_STAMPLINGSLANGD } from './tillstand';

// ---------------------------------------------------------------------------
// Det osäkra (import_varningar)
// ---------------------------------------------------------------------------

/** Importen sparade en PDF som "övrigt dokument" för att namnet inte kändes igen. */
const OKAND_PDF = /^PDF utan känt suffix: "(.+)" — sparad som övrigt dokument/;

export type OsakertSlag = 'stamplingslangd' | 'okand_pdf';

export interface Osakert {
  slag: OsakertSlag;
  fil: string;
  /** Raden i import_varningar som detta kommer ur (för att kunna ersättas vid bekräftelse). */
  rad: string;
}

export interface TolkadeVarningar {
  osakert: Osakert[];
  /** Bekräftade av användaren (importen ber om bekräftelse "i UI:t"). */
  bekraftade: string[];
  /** Resten — importens egna noteringar. Visas hopfällda längst ner, aldrig borttagna. */
  ovriga: string[];
}

/** Raderna som är importens bakgrundsbrus för den här vyn: Vida-kontakten, hoppade lager, okända lagernamn. De ligger kvar under "Övriga importnoteringar". */
export function tolkaVarningar(varningar: unknown): TolkadeVarningar {
  const ut: TolkadeVarningar = { osakert: [], bekraftade: [], ovriga: [] };
  if (!Array.isArray(varningar)) return ut;
  for (const v of varningar) {
    if (typeof v !== 'string') continue;
    let m = OSAKER_STAMPLINGSLANGD.exec(v);
    if (m) { ut.osakert.push({ slag: 'stamplingslangd', fil: m[1], rad: v }); continue; }
    m = OKAND_PDF.exec(v);
    if (m) { ut.osakert.push({ slag: 'okand_pdf', fil: m[1], rad: v }); continue; }
    m = BEKRAFTAD_STAMPLINGSLANGD.exec(v);
    if (m) { ut.bekraftade.push(m[1]); continue; }
    ut.ovriga.push(v);
  }
  return ut;
}

export const bekraftadRad = (fil: string): string => `Bekräftad: "${fil}" är stämplingslängd.`;

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
