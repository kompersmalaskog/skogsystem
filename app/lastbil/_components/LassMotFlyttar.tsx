'use client';

import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { periodEtikett, type Manad } from './period';
import type { LassMotFlytt } from './vikt';

const km = (v: number) => `${v.toLocaleString('sv-SE')} km`;

/**
 * Betalt, under diagrammet (bara admin): per månad "Kört med lass X km · registrerade flyttar Y km". Är X mer än 1,5 × Y står
 * "Lass kan saknas" med en länk till Körningar för månaden — bilen har kört med last som ingen registrerat som flytt.
 * Texten bär varningen (orange förstärker bara). Saknar en flytt km är Y ett minimum och det står där.
 */
export default function LassMotFlyttar({ rader, flyttarFel, onValjManad }: {
  rader: readonly LassMotFlytt[]; flyttarFel: boolean; onValjManad: (m: Manad) => void;
}) {
  if (flyttarFel) {
    return <p data-lass-mot-flyttar role="status" style={{ ...TYP.meta, color: FARG.text2, margin: `0 ${AVSTAND.xs}px` }}>Kunde inte jämföra med flyttarna just nu.</p>;
  }
  if (rader.length === 0) return null;
  return (
    <div data-lass-mot-flyttar>
      <Sektion rubrik="Saknas det lass?">
        {rader.map((r, i) => {
          const sista = i === rader.length - 1;
          const stil = { ...RAD, minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, ...(sista ? { borderBottom: 'none' } : {}) };
          const innehall = (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYP.listtitel, color: FARG.text }}>{periodEtikett(r.m).split(' ')[0]}</div>
                <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>
                  {/* Varje del är en enhet som aldrig bryts mitt i ("266 km" hålls ihop); raden bryts bara vid prickarna. */}
                  <span style={{ whiteSpace: 'nowrap' }}>Kört med lass {km(r.lassKm)}</span> · <span style={{ whiteSpace: 'nowrap' }}>registrerade flyttar {km(r.flyttKm)}</span>
                  {r.saknarKm > 0 && <> · <span style={{ whiteSpace: 'nowrap' }}>{r.saknarKm} {r.saknarKm === 1 ? 'flytt saknar' : 'flyttar saknar'} km</span></>}
                </div>
                {r.kanSaknas && <div data-lass-kan-saknas style={{ ...TYP.meta, color: FARG.orange }}>Lass kan saknas</div>}
              </div>
              {r.kanSaknas && <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>}
            </>
          );
          return r.kanSaknas
            ? <button key={r.m.man} type="button" data-lass-manad={r.m.man} onClick={() => onValjManad(r.m)}
                aria-label={`Lass kan saknas i ${periodEtikett(r.m)}. Öppna Körningar för månaden.`}
                style={{ ...stil, width: '100%', background: 'none', border: 'none', borderBottom: stil.borderBottom, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>{innehall}</button>
            : <div key={r.m.man} data-lass-manad={r.m.man} style={stil}>{innehall}</div>;
        })}
      </Sektion>
    </div>
  );
}
