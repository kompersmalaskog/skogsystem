'use client';
// KONTROLLERNA BAKOM EN RUTA — Per grovlek: vilka kontroller (och hur många stammar ur var och en) som rutan byggs av, med varje kontrolls egen träff och eget medelfel i rutan.
// Ett tryck på en kontroll öppnar den (blad nerifrån, som i Kontroller). Räkningen är gjord i lib/kalibrering/grovlek när rutan trycktes; arket ritar bara.
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND } from '@/lib/design/tokens';
import { fmtSig1 } from '@/lib/kalibrering/format';
import { GROVLEK_MIN_STAMMAR, type RutaVal } from '@/lib/kalibrering/grovlek';
import { kontrollRad } from '@/lib/kalibrering/kontrollLista';
import type { FaktKalibrering, KontrollTid } from '@/lib/kalibrering/typer';
import type { ToneToken } from '@/lib/kalibrering/bedomning';
import { Info, Meta, TalGrid } from './delar';

const TON: Record<RutaVal['ton'], ToneToken> = { gron: 'ok', neutral: 'ok', tunn: 'ok', orange: 'hi', rod: 'hot' };

export default function RutaArk({ ruta, kalib, tider, onKontroll }: {
  ruta: RutaVal; kalib: FaktKalibrering[]; tider: Record<string, KontrollTid> | null; onKontroll: (filnamn: string) => void;
}) {
  const rader = ruta.kontroller.map(k => {
    const full = kalib.find(x => x.filnamn === k.filnamn);
    return { k, rad: full ? kontrollRad(full, tider?.[k.filnamn]) : null };
  }).sort((a, b) => (b.rad?.sort ?? '').localeCompare(a.rad?.sort ?? '') || a.k.filnamn.localeCompare(b.k.filnamn));
  return (
    <>
      <Meta>{`${ruta.periodNamn} · ${ruta.stammar} ${ruta.stammar === 1 ? 'stam' : 'stammar'} i ${ruta.kontroller.length} ${ruta.kontroller.length === 1 ? 'kontroll' : 'kontroller'}`}</Meta>
      <div style={{ marginTop: AVSTAND.l }}>
        <TalGrid celler={[
          { etikett: `Träff inom ±${ruta.tolerans} mm`, varde: String(Math.round(ruta.traffPct)), enhet: '%', ton: TON[ruta.ton] },
          { etikett: 'Snitt (maskin − klave)', varde: fmtSig1(ruta.snittMm), enhet: 'mm' },
        ]} />
      </div>
      {ruta.tunn && (
        <div style={{ marginTop: AVSTAND.l }}>
          <Info ikon="info" titel="För få stammar för en bedömning">{`${ruta.stammar} stammar — det behövs minst ${GROVLEK_MIN_STAMMAR} i en ruta. Talen visas ändå så att kontrollerna går att titta på.`}</Info>
        </div>
      )}
      <div style={{ marginTop: AVSTAND.xl }}>
        <Sektion rubrik="Kontrollerna bakom rutan" kort={false} not="Varje stam räknas en gång i rutan. Träffen per kontroll är medelvärdet över kontrollens egna stammar.">
          {rader.map(({ k, rad }, i) => (
            <Rad key={k.filnamn} sista={i === rader.length - 1} onTryck={rad ? () => onKontroll(k.filnamn) : undefined}
              titel={rad ? rad.rubrik : k.filnamn}
              under={rad ? rad.rad1 : 'Kontrollen finns inte i listan'}
              hoger={`${Math.round(k.traffPct)} %`}
              hogerUnder={`${k.stammar} ${k.stammar === 1 ? 'stam' : 'stammar'} · ${fmtSig1(k.snittMm)} mm`} />
          ))}
        </Sektion>
      </div>
    </>
  );
}
