// "Öppna som maskin": /maskin?som=<maskin_id> (bara admin/chef). Laddar appen från början i maskinläge
// som den maskinen — samma startsekvens, förarlista och körvy som på maskindatorn, utan att man först
// går via planeringsvyn. Inga DB-skrivningar (testlageAktivRef spärrar dem).
//
// Den här filen är BESLUTET (rent, testbart). Sidan (page.tsx) renderar utifrån det: 'vanta' → bara
// loggan (aldrig planeringsvyn), 'tillat' → maskinläge, 'avvisa' → ärlig felskärm.

export const MASKIN_SOM_PARAM = 'som';
export const VANTA_MAX_MS = 10000;   // väntat så länge på roll/maskinregister → ärligt fel i st.f. evig logga

/** Länken som "Öppna som maskin"-knappen öppnar i ny flik. */
export function maskinSomUrl(maskinId: string): string {
  return `/maskin?${MASKIN_SOM_PARAM}=${encodeURIComponent(maskinId)}`;
}

export type AvvisaSkal = 'ejAdmin' | 'okandMaskin' | 'laddningMisslyckades';

export type MaskinSomBeslut =
  | { typ: 'ingen' }                              // ingen ?som= → vanliga appen, rör inget
  | { typ: 'vanta' }                              // ?som= finns men roll/maskinregister laddas → BARA loggan
  | { typ: 'avvisa'; skal: AvvisaSkal }           // ej behörig / okänd maskin / laddning fastnade
  | { typ: 'tillat'; maskinId: string };          // admin/chef + känd maskin → maskinläge

/** Avgör vad /maskin?som=… ska göra. Ordningen är avsiktlig:
 *  1. ingen som → ingen.  2. roll laddas → vänta.  3. roll är INTE admin/chef → avvisa direkt
 *  (väntar inte på maskinregistret — en förare ska aldrig komma åt läget).  4. maskinregistret
 *  laddas → vänta.  5. okänd maskin → avvisa.  6. annars tillåt.
 *  Väntat ≥ VANTA_MAX_MS i steg 2/4 → 'laddningMisslyckades' (ärligt fel, aldrig evig logga). */
export function beslutaMaskinSom(a: {
  som: string | null | undefined;
  rollLaddar: boolean;
  roll: string | null | undefined;
  maskinIds: string[] | null;     // null = maskinregistret inte laddat än
  vantatMs?: number;
}): MaskinSomBeslut {
  const som = (a.som ?? '').trim();
  if (!som) return { typ: 'ingen' };
  const vantaEllerFel = (): MaskinSomBeslut =>
    (a.vantatMs ?? 0) >= VANTA_MAX_MS ? { typ: 'avvisa', skal: 'laddningMisslyckades' } : { typ: 'vanta' };
  if (a.rollLaddar) return vantaEllerFel();
  if (a.roll !== 'admin' && a.roll !== 'chef') return { typ: 'avvisa', skal: 'ejAdmin' };
  if (a.maskinIds == null) return vantaEllerFel();
  if (!a.maskinIds.includes(som)) return { typ: 'avvisa', skal: 'okandMaskin' };
  return { typ: 'tillat', maskinId: som };
}

/** Texten på felskärmen (svenska, säger vad man ska göra). */
export function maskinSomFelText(skal: AvvisaSkal, som: string | null | undefined): string {
  switch (skal) {
    case 'ejAdmin': return 'Den här sidan är bara för admin och chef.';
    case 'okandMaskin': return `Okänd maskin: ${(som ?? '').trim() || '—'}. Öppna den från Maskiner i admin.`;
    case 'laddningMisslyckades': return 'Kunde inte ladda behörighet och maskinregister. Ladda om sidan eller gå tillbaka till appen.';
  }
}
