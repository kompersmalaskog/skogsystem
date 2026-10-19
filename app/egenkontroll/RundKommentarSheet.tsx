'use client';

// Rundans kommentar: nagra rader om rundan som hamnar SIST pa sida 1 i rapporten (lib/egenkontrollRapport.ts) - den
// enda delen av Vidas Redovisning som faktiskt laser sig, och darfor den enda delen vi gor plats for att skriva i fritext.
//
// SKRIVS UNDER HELA RUNDAN, inte bara i avslutsvyn (Martin 2026-10-19): man skriver bast nar man star vid stenmuren,
// inte nar man sitter i bilen hem - och ligger rutan bara i avslutssteget blir den tom. Samma falt (egenkontroll.kommentar),
// tva stallen: det har arket, och textfaltet i avslutsdialogen (page.tsx), som visar det som redan star.
//
// TEXTEN FORSVINNER ALDRIG: det man skrivit hamnar i ett lokalt utkast (lib/egenkontrollKommentarUtkast.ts) medan man skriver,
// (skrivs av sidan vid varje andring), sa att ett avbrutet ark, en omladdning eller en app som stangs vid ett tackningshal inte kastar bort den. Spara ar grå
// tills nagot andrats. Ett sparfel stanger inte arket: texten ligger kvar och felet sager vad man gor.

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TYP } from '@/lib/design/tokens';
import { sparaRundKommentar } from '@/lib/egenkontroll';
import { rensaUtkast } from '@/lib/egenkontrollKommentarUtkast';

/** Textfaltet - delas med avslutsdialogen sa de tva ser lika ut. */
export const KOMMENTAR_FALT = {
  width: '100%', minHeight: 140, boxSizing: 'border-box', resize: 'vertical',
  borderRadius: RADIE.rad, border: 'none', background: FARG.upphojt, color: FARG.text,
  ...TYP.text, fontFamily: 'inherit', padding: AVSTAND.m,
} as const;

export const KOMMENTAR_PLATSHALLARE = 'Några rader om rundan — det du vill att läsaren ska veta.';

export default function RundKommentarSheet({
  egenkontrollId,
  sparad,
  text,
  onText,
  onStang,
  onSparad,
}: {
  egenkontrollId: string;
  /** Det som star sparat pa servern (egenkontroll.kommentar). */
  sparad: string | null;
  /** Texten i faltet: utkastet om det finns, annars det sparade. Agd av sidan sa att den overlever att arket stangs. */
  text: string;
  /** Sidan sparar utkastet lokalt vid varje andring (andraKommentar i page.tsx) - arket skriver det inte sjalv. */
  onText: (t: string) => void;
  onStang: () => void;
  /** Efter en lyckad sparning. Sidan laser om rundan. */
  onSparad: () => void;
}) {
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const andrad = text.trim() !== (sparad ?? '').trim();
  const kanSpara = andrad && !sparar;

  const spara = async () => {
    if (!kanSpara) return;
    setSparar(true);
    setFel(null);
    try {
      await sparaRundKommentar(egenkontrollId, text);
      rensaUtkast(egenkontrollId);
      onSparad();
    } catch (e) {
      setFel(e instanceof Error ? e.message : 'Kunde inte spara kommentaren.');
    } finally {
      setSparar(false);
    }
  };

  return (
    <Ark
      rubrik="Kommentar om rundan"
      onStang={onStang}
      fot={(
        <button type="button" onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
      )}
    >
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder={KOMMENTAR_PLATSHALLARE}
        aria-label="Kommentar om rundan"
        style={KOMMENTAR_FALT}
      />
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
        Hamnar sist på sida 1 i rapporten. Texten sparas på telefonen medan du skriver.
      </p>
      {fel && (
        <div role="alert" style={{ ...TYP.meta, color: FARG.text, background: 'rgba(255,69,58,0.15)', borderRadius: RADIE.rad, padding: `${AVSTAND.m}px`, marginTop: AVSTAND.m }}>
          <div>{fel}</div>
          <div style={{ color: FARG.text2, marginTop: AVSTAND.xs }}>Inget är förlorat — det du skrivit ligger kvar.</div>
        </div>
      )}
    </Ark>
  );
}
