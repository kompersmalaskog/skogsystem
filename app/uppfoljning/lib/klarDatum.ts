// "Klar" i uppföljningens svar läses ur HELIKOPTERNS plan — en räkning för samma
// fråga i hela appen (prognos per trakt i körordning, uppmätt takt när maskinen
// börjat, G15-förslag där prognos saknas). Finns trakten inte i någon maskins
// plan, eller saknar planen ett datum, finns inget datum — aldrig en egen gissning.
import type { MaskinPlan, KlarRoll } from '@/app/helikopter/_lib/klar';

export type KlarDatum = { datum: string; ca: boolean };

/** Traktens slutdag per roll i maskinernas planer. `ca` när datumet bygger på ett G15-förslag någonstans före i kön. */
export function klarDatumFor(planer: Record<string, MaskinPlan>, objektUuid: string): Partial<Record<KlarRoll, KlarDatum>> {
  const ut: Partial<Record<KlarRoll, KlarDatum>> = {};
  for (const p of Object.values(planer)) {
    if (p.saknar) continue;
    const i = p.rader.findIndex(r => r.trakt.objekt_id === objektUuid);
    if (i < 0) continue;
    const rad = p.rader[i];
    if (!rad.till) continue;
    const ca = p.rader.slice(0, i + 1).some(r => r.trakt.uppskattad === true && !r.trakt.foljer);
    const fore = ut[rad.trakt.roll];
    // Två maskiner i samma roll på trakten: den som blir klar sist avgör.
    if (!fore || rad.till > fore.datum) ut[rad.trakt.roll] = { datum: rad.till, ca: ca || (fore?.ca ?? false) };
  }
  return ut;
}

/**
 * "klar om 3 dagar" / "klar om ~3 dagar" (ca = bygger på ett G15-förslag) — lättare att förstå än ett datum.
 * Kalenderdagar från idag (svensk tid), räknade på datum, aldrig på millisekunder. Idag → "klar idag", i morgon → "klar i morgon".
 */
export function klarDatumText(k: KlarDatum, idag: string): string {
  const dag = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d) / 864e5; };
  const n = Math.max(0, Math.round(dag(k.datum) - dag(idag)));
  if (n === 0) return 'klar idag';
  if (n === 1) return 'klar i morgon';
  return `klar om ${k.ca ? '~' : ''}${n} dagar`;
}
