'use client';

import { lassSaknarText } from '@/lib/lastbil/lass/vantar';
import { FelRad, TryckRad } from './AttGoraKort';
import type { SaknarLage } from './useSaknarMaskin';

/**
 * "1 lass saknar maskin" — en rad i kortet "Att göra", bara när något väntar och bara för admin (som VantarRad och Arbetsrapportens
 * väntar-rad). Trycket öppnar frågan för det äldsta lasset; när den är besvarad står nästa där. Inget väntar → ingen rad alls
 * (aldrig "0 lass"). Ett läsfel är ett fel (aldrig "inget väntar"): raden säger det och erbjuder Försök igen.
 */
export default function SaknarMaskinRad({ lage, onOppna, onForsokIgen }: { lage: SaknarLage; onOppna: (lassId: string) => void; onForsokIgen: () => void }) {
  if (lage.lage === 'fel') {
    return <FelRad attr={{ 'data-saknar-maskin': '' }} text="Kunde inte läsa vilka lass som saknar maskin" onForsokIgen={onForsokIgen} />;
  }
  if (lage.lage !== 'klar' || lage.rader.length === 0) return null;
  const forsta = lage.rader[0];
  return <TryckRad attr={{ 'data-saknar-maskin': '' }} prick text={lassSaknarText(lage.rader.length)} onTryck={() => onOppna(forsta.id)} />;
}
