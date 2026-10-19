// Gemensamma mått och stilar för skotarens lassvyer. Handskar och skakande hytt: tryckytor minst 56 px (skillen: >= 44, hytten 56).
import type { CSSProperties } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TYP, medSafeBotten } from '@/lib/design/tokens';

export const TRYCK_PX = 56;

export const knappStor: CSSProperties = { ...KNAPP.sekundar, minHeight: TRYCK_PX, width: 'auto' };
export const knappPrimar: CSSProperties = { ...KNAPP.primar, minHeight: TRYCK_PX, width: 'auto' };

/** Ett kort nedtill över kartan: lämnar plats åt plusknappen till höger och täcker så lite karta som möjligt. */
export const nertillKort: CSSProperties = {
  position: 'fixed', left: AVSTAND.l, bottom: medSafeBotten(AVSTAND.l), right: 96, maxWidth: 560, zIndex: 220,
  background: FARG.kort, color: FARG.text, borderRadius: RADIE.sheet, border: `1px solid ${FARG.linje}`, overflow: 'hidden',
  fontFamily: 'inherit',
};

export const arkRam: CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 320, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
};

export const arkPanel: CSSProperties = {
  pointerEvents: 'auto', width: '100%', maxWidth: 560, maxHeight: '86vh', display: 'flex', flexDirection: 'column',
  background: FARG.kort, color: FARG.text, borderTopLeftRadius: RADIE.sheet, borderTopRightRadius: RADIE.sheet,
  border: `1px solid ${FARG.linje}`, borderBottom: 'none', fontFamily: 'inherit',
};

export const rubrik: CSSProperties = { ...TYP.listtitel, color: FARG.text };
// Allt föraren ska LÄSA i skotarläget är minst 17 px (hytten skakar, solen blänker). Bara små versaler-rubriker får vara 13 px (`smaRubrik`).
export const meta: CSSProperties = { ...TYP.text, color: FARG.text2 };
export const smaRubrik: CSSProperties = { ...TYP.micro, fontSize: TYP.meta.fontSize, color: FARG.text3 };
export const avdelare: CSSProperties = { height: 1, background: FARG.linje, margin: `${AVSTAND.m}px 0` };
