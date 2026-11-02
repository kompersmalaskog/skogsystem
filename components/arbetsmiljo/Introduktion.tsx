'use client';

// Introduktion för ny förare — svarar på EN fråga: "Vet du det du behöver innan du kör?". Fem steg, ett tryck öppnar ett ark
// med några korta meningar och "Jag har läst". Steg 1 (telefon och anhörig) är klart när uppgifterna finns och fylls i under
// Personal. Texterna och reglerna: lib/arbetsmiljo/introduktion.ts.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, KNAPP, ROT_MIN_HOJD, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { STEG, datumText, hamtaKvitton, introLage, kvittera, type IntroLage, type LasSteg, type Steg } from '@/lib/arbetsmiljo/introduktion';

type Skyddsombud = { namn: string; telefon: string | null } | null;
type Data = { medarbetareId: string; lage: IntroLage; skyddsombud: Skyddsombud };

export default function Introduktion() {
  const [data, setData] = useState<Data | null | 'fel'>(null);
  const [valt, setValt] = useState<Steg | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);

  const hamta = useCallback(async () => {
    try {
      const r = await fetch('/api/personal', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j?.ok || !j.egenId) { setData('fel'); return; }
      const jag = (j.personal as { id: string; telefon?: string | null; anhorig_telefon?: string | null }[]).find(p => p.id === j.egenId);
      const kvitton = await hamtaKvitton(supabase, j.egenId);
      if (!jag || !kvitton) { setData('fel'); return; }
      setData({ medarbetareId: j.egenId, lage: introLage(jag, kvitton.get(j.egenId) ?? []), skyddsombud: j.skyddsombud ?? null });
    } catch { setData('fel'); }
  }, []);

  useEffect(() => { hamta(); }, [hamta]);

  const las = async () => {
    if (!valt || !data || data === 'fel' || valt.id === 'uppgifter') return;
    setSparar(true); setFel(false);
    const ok = await kvittera(supabase, data.medarbetareId, valt.id as LasSteg);
    setSparar(false);
    if (!ok) { setFel(true); return; }
    setValt(null);
    await hamta();
  };

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
          <h1 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>Välkommen</h1>
          <div data-testid="intro-svar" style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>
            {data === null ? 'Läser …'
              : data === 'fel' ? 'Kunde inte läsa introduktionen.'
              : data.lage.klarTid ? `Klar ${datumText(data.lage.klarTid)} · Du vet det du behöver`
              : `${data.lage.antalKlara} av ${data.lage.antal} klart · Det här ska du veta innan du kör`}
          </div>
          {data === 'fel' && <button type="button" onClick={() => { setData(null); hamta(); }} style={{ ...KNAPP.lank, marginTop: AVSTAND.s }}>Försök igen</button>}
        </header>

        {data && data !== 'fel' && (
          <Sektion rubrik="Introduktion">
            {STEG.map((s, i) => {
              const klar = data.lage.klar[s.id];
              return (
                <Rad key={s.id} titel={s.titel}
                  under={klar ? (typeof klar === 'string' ? `Läst ${datumText(klar)}` : 'Ifyllt') : s.kort}
                  hoger={klar ? <span data-testid={`intro-klar-${s.id}`}><Ikon namn="check_circle" farg={FARG.gron} fylld /></span> : undefined}
                  onTryck={() => { setFel(false); setValt(s); }}
                  sista={i === STEG.length - 1}
                  attr={{ 'data-testid': `intro-steg-${s.id}` }} />
              );
            })}
          </Sektion>
        )}
      </div>

      {valt && data && data !== 'fel' && (
        <Ark rubrik={valt.titel} onStang={() => setValt(null)} stang={data.lage.klar[valt.id] || valt.id === 'uppgifter' ? 'Klar' : 'Avbryt'}
          fot={valt.id === 'uppgifter' ? undefined : data.lage.klar[valt.id]
            ? <div style={{ ...TYP.text, color: FARG.text2, textAlign: 'center' }}>Läst {datumText(data.lage.klar[valt.id] as string)}</div>
            : <>
                <button type="button" data-testid="intro-las" disabled={sparar} onClick={las} style={{ ...KNAPP.primar, width: '100%' }}>{sparar ? 'Sparar …' : 'Jag har läst'}</button>
                {fel && <div role="status" data-testid="intro-fel" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.s }}>Kunde inte spara. Försök igen.</div>}
              </>}>
          <div data-testid="intro-ark" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
            {valt.rader.map((r, i) => <div key={i} style={{ ...TYP.kommentar, color: FARG.text }}>{r}</div>)}
            {valt.id === 'skyddsombud' && (
              data.skyddsombud
                ? <div data-testid="intro-skyddsombud" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s }}>
                    <div style={{ ...TYP.listtitel, color: FARG.text }}>{data.skyddsombud.namn}</div>
                    {data.skyddsombud.telefon && <a href={`tel:${data.skyddsombud.telefon}`} style={{ ...KNAPP.sekundar, textDecoration: 'none' }}>Ring</a>}
                  </div>
                : <div data-testid="intro-inget-ombud" style={{ ...TYP.text, color: FARG.text2 }}>Inget skyddsombud är valt än. Fråga arbetsledningen.</div>
            )}
            {valt.lank && <a href={valt.lank.href} data-testid="intro-lank" style={{ ...(valt.id === 'uppgifter' && !data.lage.klar.uppgifter ? KNAPP.primar : KNAPP.sekundar), textDecoration: 'none', textAlign: 'center' }}>{valt.lank.text}</a>}
          </div>
        </Ark>
      )}
    </div>
  );
}
