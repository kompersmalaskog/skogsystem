'use client'

// KALENDER (2026-11-25): när — per maskin, dag för dag. Bara data: heldraget = mätt (det som skett), streckat = maskinens nuvarande trakt framåt
// på maskinens egen takt, och inget mer. Resten av kön står som antal i högerkolumnen, utan datum. Logiken är _lib/kalender.ts; den här filen ritar.
import Rutnat from '@/components/design/Rutnat'
import Sektion from '@/components/design/Sektion'
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens'
import type { RutnatRad } from '@/components/design/Rutnat'
import { arHelgEllerRod } from '../_lib/klarRutnat'

/** Alla dagar i månaden — kalendern visar månaden, inte bara det som är kvar. */
export function manadensDagar(ar: number, manad: number): string[] {
  const n = new Date(ar, manad, 0).getDate()
  return Array.from({ length: n }, (_, i) => `${ar}-${String(manad).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
}

export default function Kalender({ ar, manad, idag, rader, matt }: { ar: number; manad: number; idag: string; rader: RutnatRad[]; matt: 'laser' | 'fel' | 'klar' }) {
  return (
    <div data-kalender="">
      <h1 style={{ margin: 0, padding: `${AVSTAND.l}px 0 ${AVSTAND.xs}px`, ...TYP.titel, color: FARG.text }}>Kalender</h1>
      <p style={{ margin: `0 0 ${AVSTAND.xl}px`, ...TYP.text, color: FARG.text2 }}>
        Heldraget är det som skett. Streckat är maskinens nuvarande trakt framåt, räknat på maskinens egen takt. Inget annat datum visas.
      </p>
      {matt === 'fel' && <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.orange }}>Kunde inte läsa vad maskinerna gjort. Ladda om sidan.</p>}
      <Sektion rubrik="Maskiner" kort={false}>
        <Rutnat dagar={manadensDagar(ar, manad)} idagIso={idag} tonadDag={arHelgEllerRod} rader={rader} avdelare="Maskiner" />
      </Sektion>
    </div>
  )
}
