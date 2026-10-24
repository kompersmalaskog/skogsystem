'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Flikkontroll from '@/components/design/Flikkontroll';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { sparaStamplingslangd } from '@/lib/objekt/data';
import { ENHET_TEXT, arEnhet, faktorText, fmtVolym, tillM3fub, type StamplingsEnhet } from '@/lib/objekt/stamplingslangd';

// Stämplingslängdens tal: skrivs in EN gång, med enhet, och jämförs sedan med objektets volym (lib/objekt/stamplingslangd.ts). Talet finns bara
// inuti PDF:en och läses inte ut — det här är hur det kommer in. Enheten är ett val utan förval när fältet är tomt: m³sk och m³fub skiljer
// ungefär 20 %, och ett fel förval skriver tyst in fel tal.
const ENHETER = [['m3sk', ENHET_TEXT.m3sk], ['m3fub', ENHET_TEXT.m3fub]] as const;

export default function StamplingslangdArk({
  objekt, onStang, onSparad,
}: {
  objekt: { id: string; namn: string; stamplingslangd_volym?: number | null; stamplingslangd_enhet?: string | null };
  onStang: () => void;
  onSparad: (text: string) => void;
}) {
  const fanns = objekt.stamplingslangd_volym != null && arEnhet(objekt.stamplingslangd_enhet);
  const [tal, setTal] = useState(fanns ? String(objekt.stamplingslangd_volym) : '');
  const [enhet, setEnhet] = useState<StamplingsEnhet | null>(fanns ? (objekt.stamplingslangd_enhet as StamplingsEnhet) : null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const v = Number(tal.replace(/[\s ]/g, '').replace(',', '.'));
  const giltigt = tal.trim() !== '' && Number.isFinite(v) && v > 0;
  const kanSpara = giltigt && enhet != null && !sparar;

  async function spara(nytt: number | null, e: StamplingsEnhet | null, text: string) {
    setSparar(true); setFel(null);
    try { await sparaStamplingslangd(objekt.id, nytt, e); onSparad(text); }
    catch (x) { setFel(x instanceof Error ? x.message : String(x)); setSparar(false); }
  }

  return (
    <Ark rubrik="Stämplingslängd" onStang={onStang}
      fot={(
        <>
          {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
          <button type="button" disabled={!kanSpara} onClick={() => spara(v, enhet, 'Stämplingslängdens tal är sparat.')} data-spara-stamplingslangd=""
            style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
            {sparar ? 'Sparar …' : 'Spara'}
          </button>
          {fanns && (
            <button type="button" disabled={sparar} onClick={() => spara(null, null, 'Stämplingslängdens tal är borttaget.')} data-ta-bort-stamplingslangd=""
              style={{ ...KNAPP.lank, ...(sparar ? INAKTIV : null) }}>
              Ta bort talet
            </button>
          )}
        </>
      )}>
      <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>
        {objekt.namn}. Talet står i stämplingslängden (PDF:en). Skriv det som det står, och välj enheten som det anges i.
      </p>
      <div style={{ marginBottom: AVSTAND.l }}>
        <Flikkontroll flikar={ENHETER} aktiv={enhet} onVal={setEnhet} />
      </div>
      <Falt etikett="Stämplingslängdens tal" value={tal} onChange={setTal} inputMode="decimal" enhet={enhet ? ENHET_TEXT[enhet] : undefined}
        stod={giltigt && enhet === 'm3sk' ? `≈ ${fmtVolym(tillM3fub(v, 'm3sk'))} m³fub (${faktorText()})` : undefined} />
    </Ark>
  );
}
