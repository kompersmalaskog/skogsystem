// Tillståndet på ett objekt i klartext — Väntar på planering · Planerad · Igång · Klar — och vad som saknas på raden.
//
// `objekt.status` är CHECK-låst (oplanerad, planerad, pagaende, skotning, avslutat), men gammal data kan ha `klar`/`skordning`
// (CLAUDE.md, objekt.status). Allt som inte är känt blir "Status saknas" — aldrig en gissning att det väntar.
//
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
  traktdirektiv_url: string | null;
  stamplingslangd_url: string | null;
  import_varningar: unknown;
}

/** Är stämplingslängden en osäker tolkning som ännu inte bekräftats? (Importen skriver en OSÄKER-rad i `import_varningar`.) */
export const OSAKER_STAMPLINGSLANGD = /^"(.+)" tolkad som stämplingslängd via Info — OSÄKER/;
export const BEKRAFTAD_STAMPLINGSLANGD = /^Bekräftad: "(.+)" är stämplingslängd/;

export function harOsakerStamplingslangd(varningar: unknown): boolean {
  return Array.isArray(varningar) && varningar.some(v => typeof v === 'string' && OSAKER_STAMPLINGSLANGD.test(v));
}

/**
 * Det som saknas OCH som någon kan göra något åt. Ett klart objekt får ingen sådan rad (inget att åtgärda).
 * Stämplingslängd gäller slutavverkning; en gallring skrivs inte upp för att den saknas (ingen av de nio gallringarna i
 * prod har någon — se rapporten, detta är ett antagande att bekräfta).
 */
export function saknas(o: ObjektSaknar): string[] {
  if (tillstandId(o.status) === 'klar') return [];
  const ut: string[] = [];
  if (!(typeof o.volym === 'number' && o.volym > 0)) ut.push('saknar volym');
  if (!o.traktdirektiv_url) ut.push('saknar traktdirektiv');
  if (o.typ === 'slutavverkning') {
    if (harOsakerStamplingslangd(o.import_varningar)) ut.push('stämplingslängd osäker');
    else if (!o.stamplingslangd_url) ut.push('saknar stämplingslängd');
  }
  return ut;
}
