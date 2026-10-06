// Delade ark-delar för /oversikt-v2: maskin-arket, objekt-arket och GROT-arken ska se EXAKT likadana ut.
// Knapparna och arkets ram flyttades ordagrant ur page.tsx (en Next-sida kan inte exportera annat än sin default) — inga värden
// ändrade. VarningLista/VarningRader (faror och hänsyn med planerarens kommentar) delas av objekt-arket och GROT-objekt-arket.
import React from 'react';
import { FARG, TYP, AVSTAND, RADIE } from '@/lib/design/tokens';
import type { Varning } from './objekt-info';
import { VARNING_LASFEL, type VarningsSvar } from './markeringar-las';

export const KNAPP: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s, flexGrow: 1, minHeight: 50, border: `0.5px solid #48484a`, borderRadius: RADIE.knapp, textDecoration: 'none', ...TYP.listtitel, color: FARG.text, fontFamily: 'inherit', background: 'transparent', cursor: 'pointer' };
export const KNAPP_LITEN: React.CSSProperties = { ...KNAPP, minHeight: 44, ...TYP.text };

export const SheetBas: React.CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 8, display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, boxShadow: '0 -8px 30px rgba(0,0,0,0.5)' };
export function Grabber({ onClose }: { onClose: () => void }) {
  return <button onClick={onClose} aria-label="Stäng" style={{ display: 'flex', justifyContent: 'center', border: 'none', background: 'none', padding: `${AVSTAND.xs}px 0`, cursor: 'pointer' }}><div style={{ width: 36, height: 5, borderRadius: 3, background: '#48484a' }} /></button>;
}

// Faror och hänsyn i objekt-arken: ALLA, var och en med planerarens kommentar under sig. Objekt-arket och GROT-objekt-arket delar
// de här två så de aldrig kan säga olika. Färgen förstärker bara — raden heter "Faror" resp. "Hänsyn", och kommentaren är vit text.
export function VarningLista({ items, farg }: { items: Varning[]; farg: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      {items.map((v, i) => (
        <div key={i}>
          <div style={{ color: farg, fontWeight: 600 }}>{v.label}</div>
          {v.kommentar && <div style={{ ...TYP.meta, color: FARG.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v.kommentar}</div>}
        </div>
      ))}
    </div>
  );
}
/** Raderna "Faror" (bara när det finns några) och "Hänsyn" (bara när det finns några) — ligger direkt i arkets 2-kolumnsgrid (fragment,
 *  ingen egen ruta). "ingen" står BARA när läsningen lyckades och gav 0 faror/hänsyn. Misslyckades den står det orange att den inte gick
 *  att läsa (kolla planeringen) — aldrig "ingen" — och pågår den står det "–". */
export function VarningRader({ svar }: { svar: VarningsSvar }) {
  const rad = (etikett: string, varde: React.ReactNode) => (<><div style={{ color: FARG.text2 }}>{etikett}</div><div>{varde}</div></>);
  if (svar === 'laddar') return rad('Hänsyn', <span style={{ color: FARG.text2 }}>–</span>);
  if (svar === 'fel') return rad('Hänsyn', <span role="alert" style={{ color: FARG.orange }}>{VARNING_LASFEL}</span>);
  const { faror, hansyn } = svar;
  if (faror.length === 0 && hansyn.length === 0) return rad('Hänsyn', <span style={{ color: FARG.text2 }}>ingen</span>);
  return (
    <>
      {faror.length > 0 && rad('Faror', <VarningLista items={faror} farg={FARG.rod} />)}
      {hansyn.length > 0 && rad('Hänsyn', <VarningLista items={hansyn} farg={FARG.orange} />)}
    </>
  );
}
