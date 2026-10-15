'use client';

import Ark from '@/components/design/Ark';
import LastbilKarta from '@/components/LastbilKarta';
import { AVSTAND, FARG, RAD, TNUM, TYP } from '@/lib/design/tokens';
import { fmtLPerMil, rundaLPerMil, type Runda } from './rundor';
import { benEtikett, fmtMinuter, rundaAnmarkningar, rundaRubrik, rundaTidRad, type Farg } from './rundaText';
import { fmtKlocka } from './nu';
import { useRundaSpar } from './useRundaSpar';

const FARG_AV: Record<Farg, string> = { orange: FARG.orange, gron: FARG.gron, dampad: FARG.text2 };
const km = (v: number | null) => (v == null ? 'saknas i datan' : `${Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v) : (Math.round(v * 10) / 10).toLocaleString('sv-SE')} km`);

function Rad({ rubrik, under, hoger, hogerUnder, farg = FARG.text, sista }: { rubrik: string; under?: string | null; hoger?: string; hogerUnder?: string; farg?: string; sista?: boolean }) {
  return (
    <div style={{ ...RAD, ...(sista ? { borderBottom: 'none' } : {}), alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: farg }}>{rubrik}</div>
        {under && <div style={{ ...TYP.meta, color: FARG.text2 }}>{under}</div>}
      </div>
      {hoger && (
        <div style={{ textAlign: 'right', ...TNUM }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{hoger}</div>
          {hogerUnder && <div style={{ ...TYP.meta, color: FARG.text2 }}>{hogerUnder}</div>}
        </div>
      )}
    </div>
  );
}

function Nyckelrad({ namn, varde }: { namn: string; varde: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, padding: `${AVSTAND.xs}px 0`, ...TYP.meta, ...TNUM }}>
      <span style={{ color: FARG.text2 }}>{namn}</span>
      <span style={{ color: FARG.text, textAlign: 'right' }}>{varde}</span>
    </div>
  );
}

/**
 * Arket för EN runda (lager 3: allt som inte ryms på raden). Benen i ordning, hela rundans mätare mot
 * rutt, diesel, förare och tid — och kartan för just den här rundan, först när arket öppnas. Saknade
 * värden står som "saknas i datan", aldrig 0.
 */
export default function RundaArk({ runda, onStang }: { runda: Runda; onStang: () => void }) {
  const spar = useRundaSpar(runda.tom ? null : runda.id);
  const lpm = fmtLPerMil(rundaLPerMil(runda));
  const anmarkningar = rundaAnmarkningar(runda);
  const sistaPunkt = spar.lage === 'klar' && spar.punkter.length ? spar.punkter[spar.punkter.length - 1] : null;

  return (
    <Ark rubrik={`${rundaRubrik(runda)}`} onStang={onStang}>
      <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginBottom: AVSTAND.xs }}>
        {rundaTidRad(runda)}{runda.giltig && runda.slut ? ` – ${fmtKlocka(runda.slut)}` : ''}
      </div>

      <div>
        {runda.flytt && runda.tillKm != null && runda.tillKm > 0 && <Rad rubrik="Till maskinen" farg={FARG.text2} hoger={km(runda.tillKm)} />}
        {runda.ben.map(b => {
          const e = benEtikett(b);
          return (
            <Rad key={b.id} rubrik={b.maskin}
              under={`${b.fran ?? 'Okänd plats'} → ${b.till ?? 'okänd plats'}${b.tomKm ? ` · tomkörning ${b.tomKm} km` : ''}`}
              hoger={km(b.km)} hogerUnder={`${b.min != null ? fmtMinuter(b.min) + ' · ' : ''}${e.text}`} />
          );
        })}
        {!runda.flytt && !runda.tom && runda.giltig && <Rad rubrik="Körd" farg={FARG.text2} hoger={km(runda.km)} />}
        {runda.hemKm != null && runda.hemKm > 0 && (
          <Rad rubrik={`Hem${runda.hemMatt === false ? ' (beräknad)' : ''}`} farg={FARG.text2} hoger={km(runda.hemKm)} sista />
        )}
      </div>

      <div style={{ borderTop: `1px solid ${FARG.linje}`, marginTop: AVSTAND.s, paddingTop: AVSTAND.s }}>
        <Nyckelrad namn="Förare" varde={runda.forare ?? 'Ingen registrerad'} />
        <Nyckelrad namn="Mätare" varde={km(runda.matareKm)} />
        {runda.ruttKm != null && <Nyckelrad namn="Rutt" varde={km(runda.ruttKm)} />}
        <Nyckelrad namn="Diesel" varde={runda.literRa != null && runda.literRa > 0 ? `${(Math.round(runda.literRa * 10) / 10).toLocaleString('sv-SE')} l${lpm ? ` · ${lpm} l/mil` : ''}` : 'saknas i datan'} />
        <Nyckelrad namn="Tid" varde={fmtMinuter(runda.minuter)} />
      </div>

      {anmarkningar.length > 0 && (
        <div style={{ marginTop: AVSTAND.s, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          {anmarkningar.map(a => <p key={a.text} style={{ ...TYP.meta, color: FARG_AV[a.farg], margin: 0 }}>{a.text}</p>)}
        </div>
      )}

      {!runda.tom && (
        <div style={{ marginTop: AVSTAND.m }}>
          {spar.lage === 'klar' && spar.punkter.length > 0 && (
            <LastbilKarta position={sistaPunkt} segment={spar.segment} punkter={spar.punkter} height={220} puls={runda.pagar} />
          )}
          <p role="status" style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
            {spar.lage === 'laddar' && 'Hämtar och matchar spåret …'}
            {spar.lage === 'fel' && 'Kunde inte läsa spåret just nu.'}
            {spar.lage === 'klar' && spar.punkter.length === 0 && 'Inga spårpunkter finns för den här rundan.'}
            {spar.lage === 'klar' && spar.punkter.length > 0 && `Kört spår, grov upplösning${spar.nagonOmatchad ? ' · någon sträcka gick inte att matcha mot vägen' : ''}`}
          </p>
        </div>
      )}
    </Ark>
  );
}
