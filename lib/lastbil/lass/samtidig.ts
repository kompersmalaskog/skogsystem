// "En flytt med H8E -23 finns samma tid" — det som frågan om ett lass ska säga när förarens registrering ligger på samma tid men
// inte räknas som samma flytt (annan plats, eller avbruten). Den som svarar kan då avvisa lasset ("Det var ingen maskinflytt") i
// stället för att skapa en dubblett. Skrivs i bevis.flytt_samma_tid av engångskörningen (historik.ts); cron-jobbet skriver den aldrig.

export interface SamtidigFlytt {
  flytt_id: string;
  maskin_id: string | null;
  extern_maskin: string | null;
  avbruten: boolean;
  skal: 'annan_plats' | 'avbruten';
}

/** `maskinNamn` är maskinens visningsnamn när det går att slå upp; annars en maskin utan namn ("en maskin"), aldrig ett maskin_id. */
export function samtidigText(s: Pick<SamtidigFlytt, 'avbruten' | 'extern_maskin'>, maskinNamn: string | null): string {
  const vem = maskinNamn ?? (s.extern_maskin?.trim() || 'en maskin');
  return s.avbruten ? `En avbruten flytt med ${vem} finns samma tid` : `En flytt med ${vem} finns samma tid`;
}

/** Tolkar bevis.flytt_samma_tid defensivt: raden kommer ur en jsonb-kolumn, och ett konstigt värde ska aldrig välta arket. */
export function samtidigaUrBevis(bevis: unknown): SamtidigFlytt[] {
  const lista = (bevis as { flytt_samma_tid?: unknown } | null)?.flytt_samma_tid;
  if (!Array.isArray(lista)) return [];
  return lista.filter((x): x is SamtidigFlytt => !!x && typeof x === 'object' && typeof (x as SamtidigFlytt).flytt_id === 'string')
    .map(x => ({ flytt_id: x.flytt_id, maskin_id: x.maskin_id ?? null, extern_maskin: x.extern_maskin ?? null, avbruten: !!x.avbruten, skal: x.skal === 'avbruten' ? 'avbruten' : 'annan_plats' }));
}
