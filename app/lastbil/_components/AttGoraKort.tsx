'use client';

import type { ReactNode } from 'react';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, KNAPP, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';

/** Radens grundstil i "Att göra": 44 px, linje under (utom sista raden), hela raden är trycket. */
export const ATT_GORA_RAD = { ...RAD, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0` } as const;

export function Chevron() {
  return <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>;
}

/** Tryckbar rad: orange prick (om något väntar), texten, valfritt tal till höger, chevron. Orden bär betydelsen, pricken förstärker. */
export function TryckRad({ text, hoger, prick, onTryck, sista, attr }: {
  text: string; hoger?: string; prick?: boolean; onTryck: () => void; sista?: boolean; attr: Record<string, string>;
}) {
  return (
    <button type="button" {...attr} onClick={onTryck}
      style={{ ...ATT_GORA_RAD, background: 'none', border: 'none', borderBottom: sista ? 'none' : RAD.borderBottom, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
      {prick && <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.orange, flex: 'none' }} />}
      <span style={{ ...TYP.listtitel, color: FARG.text, flex: 1, minWidth: 0 }}>{text}</span>
      {hoger && <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{hoger}</span>}
      <Chevron />
    </button>
  );
}

/** Läsfel på en rad: orden säger det och "Försök igen" ligger bredvid. Aldrig "0" eller "inget väntar". */
export function FelRad({ text, onForsokIgen, sista, attr }: { text: string; onForsokIgen: () => void; sista?: boolean; attr: Record<string, string> }) {
  return (
    <div role="alert" {...attr}
      style={{ ...ATT_GORA_RAD, justifyContent: 'space-between', borderBottom: sista ? 'none' : RAD.borderBottom }}>
      <span style={{ ...TYP.meta, color: FARG.text2 }}>{text}</span>
      <button type="button" onClick={onForsokIgen} style={{ ...KNAPP.lank, ...TYP.meta }}>Försök igen</button>
    </div>
  );
}

/** Sista raden i kortet har ingen linje under — raderna vet inte själva vilken som blir sist (en rad finns bara när den har något). */
const ATT_GORA_CSS = `.lb-att-gora > :last-child { border-bottom: none !important; }`;

/**
 * "Vad behöver du göra?" — bara admin, och bara när något väntar: lass som saknar maskin eller flyttar som väntar på godkännande
 * (eller när en läsning av dem föll — raden säger då vad som inte gick att läsa). Inget väntar → inget kort alls.
 * Faktureringen är en egen fråga ("Vad ska faktureras?") under, inte en rad här.
 */
export default function AttGoraKort({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{ATT_GORA_CSS}</style>
      <Sektion rubrik="Vad behöver du göra?" className="lb-att-gora">{children}</Sektion>
    </>
  );
}
