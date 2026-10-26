'use client';
// Vid start i maskinen: ETT kort "Tillåt notiser så ser du besök och fara när Opti ligger framme" + knapp. Bara när Chrome inte frågat än, och bara en gång (lib/hytt/tillatKort).
// Larm och besök går före – kortet väntar (`dolj`). Efter tryck frågar Chrome; svaret syns i Inställningar › Notiser i hytten.
import React, { useEffect, useState } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TYP } from '@/lib/design/tokens';
import { beOmBehorighet } from '@/lib/hytt/notisVisa';
import { lasTillatKortLage, markeraTillatKortVisat, TILLAT_KNAPP, TILLAT_RUBRIK } from '@/lib/hytt/tillatKort';

export default function HyttNotisTillat({ aktiv, dolj, top }: { aktiv: boolean; dolj: boolean; top: string }) {
  const [visa, setVisa] = useState(false);
  useEffect(() => { setVisa(lasTillatKortLage(aktiv)); }, [aktiv]);
  if (!visa || dolj) return null;
  const tillat = async () => {
    markeraTillatKortVisat();   // kortet frågar EN gång, oavsett vad föraren svarar
    setVisa(false);
    await beOmBehorighet();
  };
  return (
    <div data-testid="hytt-tillat-kort" role="status" style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 125, maxWidth: 520, margin: '0 auto', background: FARG.upphojt, color: FARG.text, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
      <div style={{ ...TYP.listtitel }}>{TILLAT_RUBRIK}</div>
      <button type="button" data-testid="hytt-tillat-knapp" onClick={tillat} style={{ ...KNAPP.primar, marginTop: AVSTAND.m }}>{TILLAT_KNAPP}</button>
    </div>
  );
}
