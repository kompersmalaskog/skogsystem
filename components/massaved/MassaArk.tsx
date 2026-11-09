'use client';

// Arket bakom "Massa idag 4,5 m" i hyttens namnfält. Ett ark man bara läser: stängs med Klar.
import Ark from '@/components/design/Ark';
import { designCss } from '@/lib/design/tokens';
import MassaInnehall, { type MassaInnehallProps } from './MassaInnehall';

export default function MassaArk({ onStang, ...p }: Omit<MassaInnehallProps, 'iArk'> & { onStang: () => void }) {
  return (
    <>
      <style>{designCss}</style>
      <Ark rubrik="Massaveden" stang="Klar" onStang={onStang}>
        <MassaInnehall {...p} iArk />
      </Ark>
    </>
  );
}
