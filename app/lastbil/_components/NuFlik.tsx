'use client';

import { useState } from 'react';
import Tillstand from '@/components/design/Tillstand';
import Ark from '@/components/design/Ark';
import LastbilKarta from '@/components/LastbilKarta';
import { AVSTAND, FARG, IKON, KNAPP, KORT, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { fmtAlder, fmtDatum, harledHero, lampRad, matareText, rundaTitel, senasteKorning, tankRad, type Hero, type LastbilData } from './nu';
import type { NuLage } from './useLastbilNu';

const FARG_AV: Record<Hero['farg'], string> = { text: FARG.text, rod: FARG.rod, orange: FARG.orange };

function Status({ text, rollAlert }: { text: string; rollAlert?: boolean }) {
  return (
    <p role={rollAlert ? 'alert' : 'status'} style={{ ...TYP.text, color: rollAlert ? FARG.rod : FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>{text}</p>
  );
}

/**
 * Nu: "Kan jag köra, och var är den?" Högst tre block i viloläge (tre-lager-regeln, Martin 2026-10-14):
 * läget (hero), ETT kort med tank, varningar och mätare, och ETT kort med senaste körning.
 * Kartan och allt annat ligger bakom ett tryck — aldrig som yta man landar på.
 */
export default function NuFlik({ lage, onForsokIgen, onOppnaRunda }: { lage: NuLage; onForsokIgen: () => void; onOppnaRunda: (r: { id: string; start: string }) => void }) {
  const [platsArk, setPlatsArk] = useState(false);

  if (lage.lage === 'laddar') return <Status text="Läser lastbilsdata …" />;
  if (lage.lage === 'utloggad') return <Status text="Du är utloggad. Logga in igen." rollAlert />;
  if (lage.lage === 'fel') {
    return (
      <div style={{ textAlign: 'center', padding: `${AVSTAND.xl}px 0` }}>
        <Status text="Kunde inte läsa lastbilsdata just nu." rollAlert />
        <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
      </div>
    );
  }
  const data: LastbilData = lage.data;
  if (!data.harData) {
    return (
      <div style={{ ...KORT, textAlign: 'center' }}>
        <p style={{ ...TYP.listtitel, color: FARG.text, margin: 0 }}>Ingen data från lastbilen än.</p>
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Så snart bilen loggar en position dyker den upp här.</p>
      </div>
    );
  }

  const hero = harledHero(data);
  const tank = tankRad(data);
  const lampa = lampRad(data);
  const matare = matareText(data);
  const senaste = senasteKorning(data.rundor);
  const farg = (f: 'text' | 'rod' | 'orange' | 'gron' | 'dampad') =>
    f === 'rod' ? FARG.rod : f === 'orange' ? FARG.orange : f === 'gron' ? FARG.gron : f === 'dampad' ? FARG.text2 : FARG.text;
  const heroNyckel = `${hero.mikro ?? ''}|${hero.rubrik}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      {lage.uppdateringsFel && (
        <p role="status" style={{ ...TYP.meta, color: FARG.orange, margin: 0 }}>Kunde inte uppdatera. Visar det senast lästa.</p>
      )}

      {/* Block 1: läget */}
      <section style={KORT} aria-label="Läge">
        <Tillstand nyckel={heroNyckel}>
          {hero.mikro && (
            <div style={{ ...TYP.micro, color: FARG.text2, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
              {hero.puls && <span className="puls" aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.text }} />}
              {hero.mikro}
            </div>
          )}
          <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...(hero.tal ? TYP.rubrik : TYP.titel), color: FARG_AV[hero.farg] }}>{hero.rubrik}</h1>
          {hero.rad && <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{hero.rad}</p>}
          {hero.tal && <div style={{ ...TYP.tal, color: FARG.text, marginTop: AVSTAND.m }}>{hero.tal}</div>}
          <p style={{ ...TYP.meta, ...TNUM, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>{hero.meta}</p>
        </Tillstand>
        {data.position && (
          <button type="button" onClick={() => setPlatsArk(true)} style={{ ...KNAPP.lank, marginTop: AVSTAND.xs }}>
            Visa var den står
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 'inherit' }}>chevron_right</span>
          </button>
        )}
      </section>

      {/* Block 2: tank, varningar och mätare i ETT kort */}
      <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }} aria-label="Tank, varningar och mätare">
        <div style={RAD}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYP.listtitel, color: farg(tank.farg) }}>{tank.rubrik}</div>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{tank.under}</div>
          </div>
        </div>
        <div style={RAD}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYP.listtitel, color: farg(lampa.farg) }}>{lampa.rubrik}</div>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{lampa.under}</div>
          </div>
        </div>
        <div style={{ ...RAD, borderBottom: 'none' }}>
          <span style={{ ...TYP.meta, color: FARG.text2, flex: 1 }}>Mätare</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{matare.km}</div>
            {matare.motortimmar && <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{matare.motortimmar}</div>}
          </div>
        </div>
      </section>

      {/* Block 3: senaste körning (ett kort) */}
      <section style={KORT} aria-label="Senaste körning">
        <div style={{ ...TYP.micro, color: FARG.text2 }}>Senaste körning</div>
        {senaste ? (
          <button type="button" onClick={() => onOppnaRunda({ id: senaste.id, start: senaste.starttid as string })}
            style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, width: '100%', minHeight: TRAFFYTA.min, marginTop: AVSTAND.xs, padding: 0, background: 'none', border: 'none', textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0, ...TYP.listtitel, color: FARG.text }}>{fmtDatum(senaste.starttid)} · {rundaTitel(senaste)}</div>
            <div style={{ textAlign: 'right', ...TNUM }}>
              <div style={{ ...TYP.listtitel, color: FARG.text }}>{senaste.matare_km != null ? `${Math.round(senaste.matare_km)} km` : '–'}</div>
              <div style={{ ...TYP.meta, color: FARG.text2 }}>{senaste.bransle_l != null && senaste.bransle_l > 0 ? `${Math.round(senaste.bransle_l)} l` : 'diesel saknas'}</div>
            </div>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
          </button>
        ) : (
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Inga avslutade körningar i datan än.</p>
        )}
      </section>

      {platsArk && data.position && (
        <Ark rubrik="Var står den" onStang={() => setPlatsArk(false)}>
          <LastbilKarta position={data.position} segment={[]} punkter={data.spar_idag ?? []} height={240} puls={!!data.oppen_runda} />
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>Senast sedd {fmtAlder(data.position.alder_min)}</p>
        </Ark>
      )}
    </div>
  );
}
