'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import LastbilKarta from '@/components/LastbilKarta';
import { AVSTAND, FARG, KNAPP, KORT, TNUM, TYP } from '@/lib/design/tokens';
import { kontaktRadArk, lageSvar, lampaRubrik, matareText, serviceRad, sistSedd, tankOrd, tankSvar, type TankDel } from './nu';
import type { NuLage } from './useLastbilNu';

const NIVA_FARG: Record<TankDel['niva'], string> = { ok: FARG.text, orange: FARG.orange, rod: FARG.rod, dampad: FARG.text2 };

function Status({ text, rollAlert }: { text: string; rollAlert?: boolean }) {
  return (
    <p role={rollAlert ? 'alert' : 'status'} style={{ ...TYP.text, color: rollAlert ? FARG.rod : FARG.text2, textAlign: 'center', padding: `${AVSTAND.m}px 0`, margin: 0 }}>{text}</p>
  );
}

/**
 * "Var är bilen?" — svaret först, i ord (omtag 2026-10-23, Martin: "så lätt att ett barn förstår"):
 *   Rubriken är svaret ("Står vid LBC", "Kör nu", "På väg hem") med EN rad under ("Sedan i torsdags", "Giant på flaket · 34 km · avfärd 06:41").
 *   Sedan tanken i EN mening: "Tanken räcker 540 km". Diesel och AdBlue står bara när de är låga eller saknas.
 *   Bara när det gäller: en tänd varningslampa tar över (röd), service under 1 000 km kvar, och "Ingen kontakt sedan …" — bara medan bilen KÖR
 *   (en parkerad bil som inte hörts av står där den stod; kartarket säger alltid när den senast hördes).
 *   Länken "Visa var den står" öppnar kartarket — där bor också mätare och motortimmar.
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
    const oppen = !!data.oppen_runda;
    const sedd = oppen ? sistSedd(data) : null;
    const svar = lageSvar(data);
    const tank = tankSvar(data);
    return (
      <>
        {lage.uppdateringsFel && (
          <p role="status" style={{ ...TYP.meta, color: FARG.orange, margin: `0 0 ${AVSTAND.s}px` }}>Kunde inte uppdatera. Visar det senast lästa.</p>
        )}
        {lampa && (
          <div data-lampa style={{ marginBottom: AVSTAND.m }}>
            <div style={{ ...TYP.rubrik, color: FARG.rod }}>{lampa.rubrik}</div>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{lampa.under}</div>
          </div>
        )}
        <div data-lage style={{ ...TYP.rubrik, color: FARG.text, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          {oppen && <span className="puls" aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.text, flex: 'none' }} />}
          <span>{svar.rubrik}</span>
        </div>
        {svar.under && <div data-lage-under style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{svar.under}</div>}
        <div data-tank data-niva={tank.niva} style={{ ...TYP.text, ...TNUM, color: NIVA_FARG[tank.niva], marginTop: AVSTAND.m }}>{tank.text}</div>
        {tankOrd(data).map((d, i) => (
          <div key={i} data-tank-ord={d.niva} style={{ ...TYP.meta, color: NIVA_FARG[d.niva], marginTop: AVSTAND.xs }}>{d.ord}</div>
        ))}
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
      <Sektion rubrik="Var är bilen?" kort={false}>
        <div style={KORT}>{innehall}</div>
      </Sektion>
      {platsArk && data?.position && matare && (
        <Ark rubrik="Var står den" onStang={() => setPlatsArk(false)}>
          <LastbilKarta position={data.position} segment={[]} punkter={data.spar_idag ?? []} height={240} puls={!!data.oppen_runda} />
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.m}px` }}>{kontaktRadArk(data)}</p>
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
