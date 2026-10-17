'use client';

// SE-LÄGET i "Klar med trakten?": allt klart (och efter Klar för maskin) — EN sida som ett ifyllt A4, allt synligt utan att fälla ut något.
// Sektionerna: PROGNOS · FÖRUTSÄTTNINGAR · HAR DU … · MARKÄGARE & ÖVRIGT. Ett tryck på en sektion (eller en rad/ett svar i den) öppnar samma steg-vy som i GÖRA för att
// ändra; efter ändringen är man tillbaka här. Ren presentation.

import React from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { HAR_DU_FRAGOR, BARIGHET_VAL, SKOTNINGSAVSTAND_VAL, TERRANG_VAL, utforareLage, type HarDuId } from '@/lib/klarTrakt';
import type { StegId } from '@/lib/klarSteg';
import { dagManad, datum, fmtPrestation } from '@/lib/klarFormat';
import { svTal } from '@/lib/objektKort';
import { Pil } from './infoDelar';
import { maskinNamnFor } from './KlarSteg';
import type { KlarMedTraktenProps, MaskinPrognos } from './KlarMedTrakten';

type Ovrigt = KlarMedTraktenProps['ovrigt'];

/** Avvikelserna från standard i klartext — tom lista = "Inga avvikelser". Räknas aldrig som "kvar". */
export function avvikelseTexter(o: Ovrigt): string[] {
  const ut: string[] = [];
  if (o.ved) ut.push(o.vedText || 'Ved till markägaren');
  if (o.bandSkordare === true) ut.push(`Band skördare${o.bandParSkordare ? ` · ${o.bandParSkordare} par` : ''}`);
  if (o.bandSkotare === true) ut.push(`Band skotare${o.bandParSkotare ? ` · ${o.bandParSkotare} par` : ''}`);
  if (o.breddat) ut.push('Breddat lastrede');
  if (o.visaKonfiguration && o.konfiguration === 'smal') ut.push('Konfiguration smal');
  if (o.risDirekt) ut.push('Ris skotas direkt');
  if (o.extraVagn) ut.push('Extra vagn');
  if (!o.trailerIn) ut.push(`Trailern kan inte köra in${o.trailerKommentar.trim() ? ` · ${o.trailerKommentar.trim()}` : ''}`);
  if (o.manuellFallning) ut.push(`Manuell fällning${o.manuellFallningText.trim() ? ` · ${o.manuellFallningText.trim()}` : ''}`);
  return ut;
}

const namnPa = (val: ReadonlyArray<{ id: string; namn: string }>, v: string | null) => val.find((x) => x.id === v)?.namn ?? v ?? '–';

/** En sektion: versal rubrik + (valfri) text till höger, sedan innehållet. */
function SeBlock({ id, titel, hoger, hogerTon, children }: { id: string; titel: string; hoger?: string; hogerTon?: 'gron' | 'orange'; children: React.ReactNode }) {
  return (
    <section data-testid={`klar-se-${id}`} style={{ marginBottom: AVSTAND.sektion }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m, margin: `0 ${AVSTAND.xs}px ${AVSTAND.s}px` }}>
        <span style={{ ...TYP.micro, color: FARG.text2 }}>{titel}</span>
        {hoger && <span data-testid={`klar-se-${id}-hoger`} style={{ ...TYP.meta, color: hogerTon === 'gron' ? FARG.gron : hogerTon === 'orange' ? FARG.orange : FARG.text2, textAlign: 'right' }}>{hoger}</span>}
      </div>
      <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, overflow: 'hidden' }}>{children}</div>
    </section>
  );
}

/** En tryckbar rad i en sektion (hela raden är en knapp, bara pilen — ingen "Ändra"-text). */
function TryckRad({ testid, onTryck, forst = false, children }: { testid: string; onTryck: () => void; forst?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" data-testid={testid} onClick={onTryck} className="press-row"
      style={{ width: '100%', minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', borderTop: forst ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
      <Pil />
    </button>
  );
}

export default function KlarSe({ p, onOppna, utanPadding = false }: { p: KlarMedTraktenProps; onOppna: (steg: StegId, fraga?: HarDuId) => void; /** i ett steg (som har egen sidmarginal) */ utanPadding?: boolean }) {
  const pg = p.prognos;
  const godkand = p.status.prognos.lage === 'godkand';
  const extern = p.status.prognos.lage === 'extern';
  const post = (id: string) => p.status.poster.find((x) => x.id === id)!;
  const avl = post('avlagg'); const bas = post('basvag');
  const besvarade = HAR_DU_FRAGOR.filter((f) => p.harDu[f.id]);
  const senaste = besvarade.map((f) => p.harDu[f.id]!).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const harDuHoger = `${besvarade.length} av ${HAR_DU_FRAGOR.length}${senaste ? ` · ${[p.avNamn(senaste.av), datum(senaste.at)].filter(Boolean).join(' ')}` : ''}`;
  const avv = avvikelseTexter(p.ovrigt);

  const maskinRad = (roll: 'skordare' | 'skotare', etikett: string, v: typeof p.skordare, lista: typeof p.maskiner.skordare, mp: MaskinPrognos, forst: boolean) => {
    const egen = utforareLage(v) === 'egen';
    return (
      <TryckRad key={roll} testid={`klar-se-prognos-${roll}`} forst={forst} onTryck={() => onOppna('prognos')}>
        <span style={{ display: 'block' }}>
          <span style={{ display: 'block' }}>{egen ? maskinNamnFor(v, lista) : `${etikett} · ${maskinNamnFor(v, lista)}`}</span>
          {egen && (
            <span style={{ display: 'block', ...TYP.meta, ...TNUM, color: FARG.text2 }}>
              {etikett} · {mp.tim.trim() ? `${svTal(mp.tim, 1)} G15-tim` : '– G15-tim'} · {mp.prestation != null ? fmtPrestation(mp.prestation) : '–'} m³fub/G15
            </span>
          )}
        </span>
      </TryckRad>
    );
  };

  return (
    <div data-testid="klar-se" style={{ padding: utanPadding ? 0 : `${AVSTAND.m}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
      {/* PROGNOS */}
      <SeBlock id="prognos" titel="PROGNOS" hoger={extern ? 'Extern utförare' : godkand ? `Stämmer ✓ ${[p.avNamn(pg.godkandAv), dagManad(pg.godkandAt)].filter(Boolean).join(' ')}` : 'Inte godkänd'} hogerTon={godkand ? 'gron' : extern ? undefined : 'orange'}>
        {extern ? (
          <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>Extern utförare på båda — inget att prognostisera</div>
        ) : (
          <>
            {maskinRad('skordare', 'Skördare', p.skordare, p.maskiner.skordare, pg.skordare, true)}
            {maskinRad('skotare', 'Skotare', p.skotare, p.maskiner.skotare, pg.skotare, false)}
          </>
        )}
      </SeBlock>

      {/* FÖRUTSÄTTNINGAR */}
      <SeBlock id="forutsattningar" titel="FÖRUTSÄTTNINGAR">
        <TryckRad testid="klar-se-forutsattningar-rad" forst onTryck={() => onOppna('forutsattningar')}>
          <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: AVSTAND.s }}>
            {([['Bärighet', namnPa(BARIGHET_VAL, p.barighet)], ['Terräng', namnPa(TERRANG_VAL, p.terrang)], ['Avstånd', namnPa(SKOTNINGSAVSTAND_VAL, p.skotningsavstand)]] as const).map(([k, v]) => (
              <span key={k} style={{ display: 'block' }}>
                <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{k}</span>
                <span style={{ display: 'block' }}>{v}</span>
              </span>
            ))}
          </span>
        </TryckRad>
        <TryckRad testid="klar-se-avlagg" onTryck={() => onOppna('avlagg')}>
          <span style={{ color: avl.kvar ? FARG.orange : FARG.text }}>{avl.kvar ? ((p.vidaAvlagg ?? []).length > 0 ? 'Vidas avlägg ej bekräftade' : 'Avlägg saknas') : avl.varde}</span>
        </TryckRad>
        <TryckRad testid="klar-se-basvag" onTryck={() => onOppna('basvag')}>
          {bas.kvar ? <span style={{ color: FARG.orange }}>Basväg saknas</span> : p.basvag.texter.length > 0 ? `Basväg ${p.basvag.sammanfattning ?? bas.varde}` : 'Ingen basväg'}
        </TryckRad>
        <TryckRad testid="klar-se-maskiner" onTryck={() => onOppna('maskiner')}>
          {`${maskinNamnFor(p.skordare, p.maskiner.skordare)} · ${maskinNamnFor(p.skotare, p.maskiner.skotare)}`}
        </TryckRad>
      </SeBlock>

      {/* HAR DU … */}
      <SeBlock id="hardu" titel="HAR DU …" hoger={harDuHoger} hogerTon={besvarade.length === HAR_DU_FRAGOR.length ? undefined : 'orange'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {HAR_DU_FRAGOR.map((f, k) => {
            const sv = p.harDu[f.id];
            return (
              <button key={f.id} type="button" data-testid={`klar-se-fraga-${f.id}`} data-besvarad={sv ? '1' : '0'} onClick={() => onOppna('harDu', f.id)} className="press-row"
                style={{ minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'flex-start', gap: AVSTAND.s, background: 'transparent', border: 'none', borderTop: k < 2 ? 'none' : `1px solid ${FARG.linje}`, borderLeft: k % 2 === 1 ? `1px solid ${FARG.linje}` : 'none', color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                <span aria-hidden="true" style={{ color: sv ? FARG.gron : FARG.orange, ...TYP.listtitel }}>{sv ? '✓' : '○'}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{f.kort}</span>
                  <span style={{ display: 'block', ...TYP.text, color: sv ? FARG.text : FARG.orange }}>{sv ? (sv.svar === 'ja' ? f.ja : f.nej) : 'Obesvarad'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SeBlock>

      {/* MARKÄGARE & ÖVRIGT */}
      <SeBlock id="ovrigt" titel="MARKÄGARE & ÖVRIGT" hoger={avv.length === 0 ? 'Inga avvikelser' : undefined}>
        {avv.length === 0 ? (
          <TryckRad testid="klar-se-ovrigt-rad" forst onTryck={() => onOppna('ovrigt')}><span style={{ color: FARG.text2 }}>Inga avvikelser från standard</span></TryckRad>
        ) : (
          avv.map((t, k) => <TryckRad key={t} testid={`klar-se-ovrigt-rad${k === 0 ? '' : `-${k}`}`} forst={k === 0} onTryck={() => onOppna('ovrigt')}>{t}</TryckRad>)
        )}
      </SeBlock>
    </div>
  );
}
