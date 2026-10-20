// Tillståndet på ett objekt i klartext — Väntar på planering · Planerad · Igång · Klar — och vad som saknas på raden.
//
// `objekt.status` är CHECK-låst (oplanerad, planerad, pagaende, skotning, avslutat), men gammal data kan ha `klar`/`skordning`
// (CLAUDE.md, objekt.status). Allt som inte är känt blir "Status saknas" — aldrig en gissning att det väntar.
//
import { fragor, volymFragor } from './filenGav';

// Ett avslutat objekt räknar INTE ner volymen: det är fortfarande inlagt i beställningen (se tackning.ts).

export type TillstandId = 'vantar' | 'planerad' | 'igang' | 'klar' | 'okant';

export const TILLSTAND_TEXT: Record<TillstandId, string> = {
  vantar: 'Väntar på planering',
  planerad: 'Planerad',
  igang: 'Igång',
  klar: 'Klar',
  okant: 'Status saknas',
};

export function tillstandId(status: string | null | undefined): TillstandId {
  switch (status) {
    case 'oplanerad': return 'vantar';
    case 'planerad': return 'planerad';
    case 'pagaende':
    case 'skotning':
    case 'skordning': return 'igang';
    case 'avslutat':
    case 'klar': return 'klar';
    default: return 'okant';
  }
}

export interface ObjektSaknar {
  typ: string | null;
  status: string | null;
  volym: number | null;
  areal?: number | null;
  stamplingslangd_volym?: number | null;
  stamplingslangd_enhet?: string | null;
  utfall?: number | null;
  kalla: string | null;
  traktdirektiv_url: string | null;
  import_varningar: unknown;
}

/**
 * Det som kräver en hand, på samma rad — och bara det. Ett klart objekt får ingen sådan rad, utom frågor om volymen.
 * Stämplingslängd flaggas INTE: kolumnen är tom på 38 av 42 slutavverkningar och 24 av 24 gallringar (prod 2026-10-19), så "saknar" vore
 * normaltillståndet. Det som går att åtgärda är en okänd PDF — en fråga, se lib/trakt/varningar.
 * Volym krävs på gallring och slutavverkning (beställningen räknas i m³fub); GROT har ingen beställning. Traktdirektiv krävs inte av objekt
 * som lagts in för hand eller via Starta jobb — de har aldrig någon.
 */
export function saknas(o: ObjektSaknar): string[] {
  // Frågorna om volymen gäller också ett klart objekt: dess volym ingår i beställningens täckning (lib/trakt/rimlighet.ts).
  const volymN = volymFragor(o).length;
  const volymText = volymN === 0 ? [] : [volymN === 1 ? '1 fråga' : `${volymN} frågor`];
  if (tillstandId(o.status) === 'klar') return volymText;
  const ut: string[] = [];
  const harBestallning = o.typ === 'gallring' || o.typ === 'slutavverkning';
  if (harBestallning && !(typeof o.volym === 'number' && o.volym > 0)) ut.push('saknar volym');
  if (!o.traktdirektiv_url && o.kalla !== 'manuell' && o.kalla !== 'starta-jobb') ut.push('saknar traktdirektiv');
  const n = fragor(o.import_varningar, { stamplingslangd_url: null, ovriga_dokument: null }).length + volymN;
  if (n > 0) ut.push(n === 1 ? '1 fråga' : `${n} frågor`);
  return ut;
}
