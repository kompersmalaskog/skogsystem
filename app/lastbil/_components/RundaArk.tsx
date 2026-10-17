'use client';

import Ark from '@/components/design/Ark';
import LastbilKarta from '@/components/LastbilKarta';
import { AVSTAND, FARG, RAD, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { fmtLPerMil, rundaLPerMil, type Runda } from './rundor';
import { benEtikett, fmtMinuter, rundaAnmarkningar, rundaRubrik, rundaTidRad, type Farg } from './rundaText';
import { fmtKlocka } from './nu';
import { useRundaSpar } from './useRundaSpar';
import { useState } from 'react';
import RattaFlyttVy from './RattaFlyttVy';
import { useBenStatus } from './useBenStatus';
import { KNAPP } from '@/lib/design/tokens';

const FARG_AV: Record<Farg, string> = { orange: FARG.orange, gron: FARG.gron, dampad: FARG.text2 };
const km = (v: number | null) => (v == null ? 'saknas i datan' : `${Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v) : (Math.round(v * 10) / 10).toLocaleString('sv-SE')} km`);

function Rad({ rubrik, under, hoger, hogerUnder, farg = FARG.text, sista, markning, markningFarg = FARG.text2, onTryck, etikett }: {
  rubrik: string; under?: string | null; hoger?: string; hogerUnder?: string; farg?: string; sista?: boolean;
  /** Ett kort ord under raden: "Rättad av Martin", "Låst · godkänd". Orden bär betydelsen, färgen förstärker bara. */
  markning?: string | null; markningFarg?: string; onTryck?: () => void; etikett?: string;
}) {
  const innehall = (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: farg }}>{rubrik}</div>
        {under && <div style={{ ...TYP.meta, color: FARG.text2 }}>{under}</div>}
        {markning && <div style={{ ...TYP.meta, color: markningFarg }}>{markning}</div>}
      </div>
      {hoger && (
        <div style={{ textAlign: 'right', ...TNUM }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{hoger}</div>
          {hogerUnder && <div style={{ ...TYP.meta, color: FARG.text2 }}>{hogerUnder}</div>}
        </div>
      )}
    </>
  );
  const stil = { ...RAD, ...(sista ? { borderBottom: 'none' } : {}), alignItems: 'flex-start' as const };
  return onTryck ? (
    <button type="button" onClick={onTryck} aria-label={etikett} style={{ ...stil, width: '100%', background: 'none', border: 'none', borderBottom: stil.borderBottom, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>{innehall}</button>
  ) : (
    <div style={stil}>{innehall}</div>
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
export default function RundaArk({ runda, onStang, arAdmin = false, namn = 'admin', onAndrad }: {
  runda: Runda; onStang: () => void;
  /** Bara admin kan rätta och stryka en flytt (och läser därför underlagets läge). */
  arAdmin?: boolean; namn?: string;
  /** Något ändrades i databasen: läs om rundorna, fakturerbart och påminnelsen. */
  onAndrad?: () => void;
}) {
  const spar = useRundaSpar(runda.tom ? null : runda.id);
  const benStatus = useBenStatus(runda.ben.map(b => b.id), arAdmin && runda.ben.length > 0);
  const [redigerar, setRedigerar] = useState<string | null>(null);
  const [kvitto, setKvitto] = useState<string[] | null>(null);
  const lpm = fmtLPerMil(rundaLPerMil(runda));
  const anmarkningar = rundaAnmarkningar(runda);
  const sistaPunkt = spar.lage === 'klar' && spar.punkter.length ? spar.punkter[spar.punkter.length - 1] : null;

  const statusKarta = benStatus.lage.lage === 'klar' ? benStatus.lage.status : null;
  const redigeraBen = redigerar ? runda.ben.find(b => b.id === redigerar) ?? null : null;
  if (redigeraBen) {
    return (
      <RattaFlyttVy ben={redigeraBen} status={statusKarta?.get(redigeraBen.id)} namn={namn}
        onTillbaka={() => setRedigerar(null)}
        onKlar={rader => { setKvitto(rader); setRedigerar(null); }}
        onAndrad={() => { benStatus.laddaOm(); onAndrad?.(); }} />
    );
  }

  return (
    <Ark rubrik={`${rundaRubrik(runda)}`} onStang={onStang}>
      <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginBottom: AVSTAND.xs }}>
        {rundaTidRad(runda)}{runda.giltig && runda.slut ? ` – ${fmtKlocka(runda.slut)}` : ''}
      </div>

      {kvitto && (
        <div role="status" data-ratta-kvitto style={{ background: FARG.fyllning, borderRadius: RADIE.knapp, padding: AVSTAND.m, marginBottom: AVSTAND.s }}>
          {kvitto.map(r => <p key={r} style={{ ...TYP.text, color: FARG.text, margin: 0 }}>{r}</p>)}
          <button type="button" onClick={() => setKvitto(null)} style={KNAPP.lank}>OK</button>
        </div>
      )}
      {arAdmin && benStatus.lage.lage === 'fel' && (
        <div style={{ marginBottom: AVSTAND.s }}>
          <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>Kunde inte läsa flyttarnas läge — att rätta en flytt är inte tillgängligt just nu.</p>
          <button type="button" onClick={benStatus.laddaOm} style={KNAPP.lank}>Försök igen</button>
        </div>
      )}

      <div>
        {runda.flytt && runda.tillKm != null && runda.tillKm > 0 && <Rad rubrik="Till maskinen" farg={FARG.text2} hoger={km(runda.tillKm)} />}
        {runda.ben.map(b => {
          const e = benEtikett(b);
          const st = statusKarta?.get(b.id);
          const las = st?.underlag?.fakturerad ? 'Låst · fakturerad' : st?.underlag?.godkand ? 'Låst · godkänd för fakturering' : null;
          const markning = st?.redigerad ? `Rättad${st.redigeradAv ? ` av ${st.redigeradAv}` : ''}${las ? ` · ${las.toLocaleLowerCase('sv')}` : ''}` : las;
          return (
            <Rad key={b.id} rubrik={b.maskin}
              under={`${b.fran ?? 'Okänd plats'} → ${b.till ?? 'okänd plats'}${b.tomKm ? ` · tomkörning ${b.tomKm} km` : ''}`}
              hoger={km(b.km)} hogerUnder={`${b.min != null ? fmtMinuter(b.min) + ' · ' : ''}${e.text}`}
              markning={markning} markningFarg={st?.redigerad ? FARG.orange : FARG.text2}
              onTryck={arAdmin && statusKarta && b.raw ? () => { setKvitto(null); setRedigerar(b.id); } : undefined}
              etikett={`Rätta flytten ${b.maskin}`} />
          );
        })}
        {!runda.flytt && !runda.tom && runda.giltig && <Rad rubrik="Körd" farg={FARG.text2} hoger={km(runda.km)} />}
        {runda.hemKm != null && runda.hemKm > 0 && (
          <Rad rubrik={`Hem${runda.hemMatt === false ? ' (beräknad)' : ''}`} farg={FARG.text2} hoger={km(runda.hemKm)} sista />
        )}
      </div>
      {arAdmin && statusKarta && runda.ben.some(b => b.raw) && (
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Tryck på en flytt för att rätta eller stryka den.</p>
      )}

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
