'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import LastbilKarta from '@/components/LastbilKarta';
import { AVSTAND, FARG, KNAPP, KORT, TNUM, TYP } from '@/lib/design/tokens';
import { fmtAlder, lageRad, lampaRubrik, matareText, serviceRad, sistSedd, tankDelar, type TankDel } from './nu';
import type { NuLage } from './useLastbilNu';

const NIVA_FARG: Record<TankDel['niva'], string> = { ok: FARG.text, orange: FARG.orange, rod: FARG.rod, dampad: FARG.text2 };

function Status({ text, rollAlert }: { text: string; rollAlert?: boolean }) {
  return (
    <p role={rollAlert ? 'alert' : 'status'} style={{ ...TYP.text, color: rollAlert ? FARG.rod : FARG.text2, textAlign: 'center', padding: `${AVSTAND.m}px 0`, margin: 0 }}>{text}</p>
  );
}

/**
 * "Bilen nu": ETT kort med bara det som behövs nu (omtaget 2026-10-19, Lastbilen är en sida utan flikar).
 *   Alltid:      läget i ord + sedan när, och EN tankrad (Diesel · AdBlue · Räckvidd, orden bredvid siffran).
 *   Bara när det gäller: en tänd varningslampa tar över rubriken, service under 1 000 km kvar, "Senast sedd …" när den är äldre än 15 min.
 *   Länken "Visa var den står" längst ner öppnar kartarket — där bor också mätare och motortimmar.
 * Läsfel är ett fel med "Försök igen"; saknade värden står som "saknas i datan", aldrig 0.
 */
export default function BilenNuKort({ lage, onForsokIgen }: { lage: NuLage; onForsokIgen: () => void }) {
  const [platsArk, setPlatsArk] = useState(false);

  const innehall = (() => {
    if (lage.lage === 'laddar') return <Status text="Läser lastbilsdata …" />;
    if (lage.lage === 'utloggad') return <Status text="Du är utloggad. Logga in igen." rollAlert />;
    if (lage.lage === 'fel') {
      return (
        <div style={{ textAlign: 'center' }}>
          <Status text="Kunde inte läsa lastbilsdata just nu." rollAlert />
          <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      );
    }
    const data = lage.data;
    if (!data.harData) {
      return (
        <div style={{ textAlign: 'center' }}>
          <p style={{ ...TYP.listtitel, color: FARG.text, margin: 0 }}>Ingen data från lastbilen än.</p>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Så snart bilen loggar en position dyker den upp här.</p>
        </div>
      );
    }
    const lampa = lampaRubrik(data);
    const service = serviceRad(data);
    const sedd = sistSedd(data);
    const tank = tankDelar(data);
    const oppen = !!data.oppen_runda;
    return (
      <>
        {lage.uppdateringsFel && (
          <p role="status" style={{ ...TYP.meta, color: FARG.orange, margin: `0 0 ${AVSTAND.s}px` }}>Kunde inte uppdatera. Visar det senast lästa.</p>
        )}
        {lampa && (
          <div data-lampa style={{ marginBottom: AVSTAND.s }}>
            <div style={{ ...TYP.rubrik, color: FARG.rod }}>{lampa.rubrik}</div>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{lampa.under}</div>
          </div>
        )}
        <div data-lage style={{ ...TYP.listtitel, color: FARG.text, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          {oppen && <span className="puls" aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.text, flex: 'none' }} />}
          <span>{lageRad(data)}</span>
        </div>
        {/* EN rad: tre värden bredvid varandra. Ryms de inte på en smal telefon bryts raden MELLAN värdena (aldrig mitt i ett), därför ingen punkt-skiljare. */}
        <div data-tank style={{ ...TYP.text, ...TNUM, color: FARG.text, marginTop: AVSTAND.xs, display: 'flex', flexWrap: 'wrap', columnGap: AVSTAND.l, rowGap: 0 }}>
          {tank.map((d, i) => (
            <span key={i} data-niva={d.niva} style={{ color: NIVA_FARG[d.niva], whiteSpace: 'nowrap' }}>{d.text}</span>
          ))}
        </div>
        {service && <div data-service style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>{service}</div>}
        {sedd && <div data-sedd style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{sedd}</div>}
        {data.position && (
          <button type="button" onClick={() => setPlatsArk(true)} style={{ ...KNAPP.lank, marginTop: AVSTAND.xs }}>
            Visa var den står
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 'inherit' }}>chevron_right</span>
          </button>
        )}
      </>
    );
  })();

  const data = lage.lage === 'klar' ? lage.data : null;
  const matare = data ? matareText(data) : null;
  return (
    <>
      <Sektion rubrik="Bilen nu" kort={false}>
        <div style={KORT}>{innehall}</div>
      </Sektion>
      {platsArk && data?.position && matare && (
        <Ark rubrik="Var står den" onStang={() => setPlatsArk(false)}>
          <LastbilKarta position={data.position} segment={[]} punkter={data.spar_idag ?? []} height={240} puls={!!data.oppen_runda} />
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.m}px` }}>Senast sedd {fmtAlder(data.position.alder_min)}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, padding: `${AVSTAND.xs}px 0`, ...TYP.meta, ...TNUM }}>
            <span style={{ color: FARG.text2 }}>Mätare</span><span data-matare style={{ color: FARG.text }}>{matare.km}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, padding: `${AVSTAND.xs}px 0`, ...TYP.meta, ...TNUM }}>
            <span style={{ color: FARG.text2 }}>Motortimmar</span><span data-motortimmar style={{ color: FARG.text }}>{matare.motortimmar}</span>
          </div>
        </Ark>
      )}
    </>
  );
}
