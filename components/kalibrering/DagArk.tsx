'use client';
// En dag i kalendern: en grupp per maskin med volym, objekttyp och dagens kontroller. Samma innehåll som den gamla modalen.
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG } from '@/lib/design/tokens';
import { dagstatusText, maskinStatusText } from '@/lib/kalibrering/kalender';
import { dec } from '@/lib/kalibrering/format';
import { maskinNamn } from '@/lib/kalibrering/ordlista';
import { cap, kontrollStatusText } from '@/lib/kalibrering/text';
import type { CalDag, CalDagstatus, FaktKalibrering } from '@/lib/kalibrering/typer';
import { Lugn, Meta, Status } from './delar';

/** Dagens status som prick + ord: grön = lämnad, röd = saknas/varning, grå = inaktiv. */
const STATUS_FARG: Record<CalDagstatus, string> = { komplett: FARG.gron, saknas: FARG.rod, varning: FARG.rod, inaktiv: FARG.text3 };

export default function DagArk({ dag, maskinId, allKalib, onKontroll }: { dag: CalDag; /** Bara den maskin vyn visar — dagen för andra maskiner hör inte hit. */ maskinId: string | null; allKalib: FaktKalibrering[]; onKontroll: (filnamn: string) => void }) {
  return (
    <>
      <Meta>{dagstatusText(dag.status)}</Meta>
      <div style={{ marginTop: AVSTAND.l }}>
        {dag.maskiner.filter(m => !maskinId || m.maskin_id === maskinId).map(m => {
          const inaktiv = m.status === 'inaktiv';
          return (
            <Sektion key={m.maskin_id} rubrik={maskinNamn(m)}>
              <Rad dampad={inaktiv} sista={m.kontroller.length === 0}
                titel={<Status farg={STATUS_FARG[m.status]} ord={maskinStatusText(m.status)} ljus />}
                under={`${dec(m.volym_m3sub, 2)} m³fub${inaktiv ? ' · Inaktiv' : m.huvudtyp ? ` · ${m.huvudtyp}` : ''}`} />
              {m.kontroller.map((k, i) => {
                const full = allKalib.find(x => x.id === k.id);
                return (
                  <Rad key={k.id} sista={i === m.kontroller.length - 1} onTryck={full ? () => onKontroll(full.filnamn) : undefined}
                    titel={`${cap(k.tradslag ?? '')} · ${kontrollStatusText(k.status)}`} />
                );
              })}
              {m.huvudtyp_okand && <div style={{ padding: `${AVSTAND.m}px 0` }}><Lugn marginTop={0}>Objekttyp ej angiven</Lugn></div>}
            </Sektion>
          );
        })}
      </div>
    </>
  );
}
