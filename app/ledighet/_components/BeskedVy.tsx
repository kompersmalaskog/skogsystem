'use client';

import React, { useEffect } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, KOLUMN, RADIE, TNUM, TYP, medSafeBotten, underTopbar } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import { beskedText, utanBrott, type BeskedBeslut } from './besked';

/**
 * Beskedsvyn — det en beslutsnotis lovar. EN skärm, EN sak: beskedet, och vägen vidare.
 *
 *  Godkänd: stor grön bock, "Din semester är godkänd", perioden STOR (skärmens tal), längden under, en vänlig rad.
 *  Nekad:   samma form men stillsam — dämpad ikon, en saklig mening, ingen hierarki, inget rött, inget "tyvärr".
 *           Vägen vidare är "Ansök om andra datum" (öppnar ansökan direkt); ingen rad om att prata med någon.
 *
 * Färgen bär aldrig ensam: rubriken säger "godkänd" / "gick inte igenom". Helskärmspanel UNDER toppfältet
 * (`underTopbar()`), nedre raden med hemindikatorhänsyn (`medSafeBotten`). Rörelsen är `.tona-*` ur designCss, som
 * i sig faller tillbaka till bara opacity vid "minska rörelser".
 */
export default function BeskedVy({ a, onTillVyn, onAnsokIgen }: {
  a: BeskedBeslut;
  onTillVyn: () => void;
  onAnsokIgen: () => void;
}) {
  const t = beskedText(a);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onTillVyn(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onTillVyn]);

  return (
    <section role="dialog" aria-modal="true" aria-label="Besked om din ledighet" className="tona-opacity" data-besked={t.slag}
      style={{ position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0, zIndex: 900, background: FARG.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: KOLUMN.smal, display: 'flex', flexDirection: 'column', padding: `0 ${AVSTAND.sidmarginal}px`, boxSizing: 'border-box' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflowY: 'auto' }}>
          {t.slag === 'godkand' ? (
            <>
              <div className="tona-in" style={{ width: IKON.stor + AVSTAND.xl, height: IKON.stor + AVSTAND.xl, borderRadius: RADIE.cirkel, background: FARG.gron, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: AVSTAND.xl }}>
                <Ikon namn="check" storlek={IKON.stor / 2} farg={FARG.bg} />
              </div>
              <h1 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>{t.rubrik}</h1>
              <p data-besked-period style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.tal, color: FARG.text }}>{utanBrott(t.period)}</p>
              {t.langd && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM, color: FARG.text2 }}>{t.langd}</p>}
              <p style={{ margin: `${AVSTAND.xl}px 0 0`, ...TYP.text, color: FARG.text }}>{t.hals}</p>
            </>
          ) : (
            <>
              <div className="tona-in" style={{ marginBottom: AVSTAND.xl }}>
                <Ikon namn="event_busy" storlek={IKON.stor} farg={FARG.text2} />
              </div>
              <h1 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>{utanBrott(t.rubrik)}</h1>
            </>
          )}
        </div>

        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.s, padding: `${AVSTAND.m}px 0 ${medSafeBotten(AVSTAND.xl)}` }}>
          {t.slag === 'nekad' ? (
            <>
              <button onClick={onAnsokIgen} style={KNAPP.primar}>Ansök om andra datum</button>
              <button onClick={onTillVyn} style={KNAPP.lank}>Till ledighetsvyn</button>
            </>
          ) : (
            <button onClick={onTillVyn} style={KNAPP.primar}>Till ledighetsvyn</button>
          )}
        </div>
      </div>
    </section>
  );
}
