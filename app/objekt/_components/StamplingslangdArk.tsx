'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Flikkontroll from '@/components/design/Flikkontroll';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { sparaStamplingslangd } from '@/lib/objekt/data';
import { ENHET_TEXT, arEnhet, domText, faktorText, jamfor, stamplingsText, type StamplingsEnhet } from '@/lib/objekt/stamplingslangd';

// Stämplingslängdens tal: skrivs in EN gång, med enhet, och jämförs sedan med objektets volym (lib/objekt/stamplingslangd.ts). Talet finns bara
// inuti PDF:en och läses inte ut — det här är hur det kommer in.
//
// ENHETEN ÄR FÖRVALD TILL m³sk (Martin 2026-10-25). Den var förut ett val utan förval, för att ett fel förval skulle kunna skriva in fel tal.
// Men stämplingslängder ÄR skrivna i m³sk, förvalet syns och går att byta med ett tryck — och priset för att inte ha det var värre: Spara var
// grå tills enheten valts, utan att säga varför, så ett inskrivet tal gick inte att spara och kortet fortsatte fråga. Noll av nio rotposter i
// prod hade ett sparat tal. Ett synligt förval på rätt värde slår en grå knapp ingen förstår; en gömd fallback (standardBolag) är något annat.
const ENHETER = [['m3sk', ENHET_TEXT.m3sk], ['m3fub', ENHET_TEXT.m3fub]] as const;

export default function StamplingslangdArk({
  objekt, onStang, onSparad,
}: {
  objekt: { id: string; namn: string; volym?: number | null; stamplingslangd_volym?: number | null; stamplingslangd_enhet?: string | null };
  onStang: () => void;
  onSparad: (text: string) => void;
}) {
  const fanns = objekt.stamplingslangd_volym != null && arEnhet(objekt.stamplingslangd_enhet);
  const [tal, setTal] = useState(fanns ? String(objekt.stamplingslangd_volym) : '');
  const [enhet, setEnhet] = useState<StamplingsEnhet>(fanns ? (objekt.stamplingslangd_enhet as StamplingsEnhet) : 'm3sk');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const v = Number(tal.replace(/[\s ]/g, '').replace(',', '.'));
  const giltigt = tal.trim() !== '' && Number.isFinite(v) && v > 0;
  const kanSpara = giltigt && !sparar;

  // Omräkningen och jämförelsen görs medan talet skrivs, så den som har papperet i handen slipper räkna i huvudet och själv bedöma 20 %.
  const jamforelse = giltigt ? jamfor(objekt.volym, v, enhet) : null;
  const dom = domText(objekt.volym, jamforelse);

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
          {/* Dirty-state hör hemma på knappen — och en grå knapp ska säga vad som fattas, annars trycker man och ingenting händer. */}
          {!giltigt && !fel && (
            <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }} data-spara-varfor="">Skriv talet som står i stämplingslängden.</p>
          )}
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
        {objekt.namn}. Skriv talet som det står i stämplingslängden.
      </p>
      <div style={{ marginBottom: AVSTAND.l }}>
        <Flikkontroll flikar={ENHETER} aktiv={enhet} onVal={setEnhet} />
      </div>
      <Falt etikett="Stämplingslängdens tal" value={tal} onChange={setTal} inputMode="decimal" enhet={ENHET_TEXT[enhet]} />
      {jamforelse && (
        <div style={{ marginTop: AVSTAND.m }} data-stamplingslangd-dom="">
          {enhet === 'm3sk' && (
            <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{stamplingsText(jamforelse)} ({faktorText()})</p>
          )}
          {dom && (
            // Färgen förstärker bara — meningen säger redan om det stämmer.
            <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: dom.avviker ? FARG.orange : FARG.gron }}>{dom.text}</p>
          )}
        </div>
      )}
    </Ark>
  );
}
