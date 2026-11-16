'use client';

// Så gör vi — skriftliga instruktioner för de jobb som har allvarliga risker (AFS 2023:1). Som en IKEA-manual:
// en rad per jobb, ett tryck öppnar stegen stora och numrerade, EN knapp: "Jag har läst" (föraren) eller "Stämmer" (admin).
// Admin ändrar stegen ("Ändra stegen") och kan gå tillbaka till appens text. Föraren ser bara godkända.
// Texterna och reglerna: lib/arbetsmiljo/saGorVi.ts. ?id=<instruktion> öppnar den direkt.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Falt from '@/components/design/Falt';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { datumText } from '@/lib/arbetsmiljo/introduktion';
import {
  INSTR_IDN, MAX_STEG, arAndrad, godkann, hamta, hamtaKvitton, instruktion, kvittera, lage, lastTid, rensaSteg, sparaSteg, svar, synligForForare,
  type Godkannande, type InstrId, type Kvitto, type Lage,
} from '@/lib/arbetsmiljo/saGorVi';

type Data = { g: Record<InstrId, Godkannande>; kvitton: Kvitto[] };

const LAGE_TEXT: Record<Lage, string> = {
  godkand: 'Godkänd', se_over: 'Godkänd för över ett år sedan – se över', andrad: 'Ändrad – godkänn igen', aldrig: 'Inte godkänd',
};

export default function SaGorVi() {
  const { medarbetare } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';
  const [data, setData] = useState<Data | null | 'fel'>(null);
  const [valt, setValt] = useState<InstrId | null>(null);
  const [andrar, setAndrar] = useState<string[] | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);

  const las = useCallback(async () => {
    if (!medarbetare) return;
    const [g, kvitton] = await Promise.all([hamta(supabase), hamtaKvitton(supabase)]);
    if (!g || !kvitton) { setData('fel'); return; }
    setData({ g, kvitton });
  }, [medarbetare]);

  useEffect(() => { void las(); }, [las]);

  const nu = new Date();
  const ok = data && data !== 'fel' ? data : null;

  const djuplank = useRef(false);
  useEffect(() => {
    if (djuplank.current || !ok) return;
    djuplank.current = true;
    const id = new URLSearchParams(window.location.search).get('id') as InstrId | null;
    if (id && INSTR_IDN.includes(id) && (arAdmin || synligForForare(lage(id, ok.g[id], new Date())))) setValt(id);
  }, [ok, arAdmin]);

  const synliga = ok ? INSTR_IDN.filter(id => arAdmin || synligForForare(lage(id, ok.g[id], nu))) : [];
  const s = ok && medarbetare ? svar(arAdmin, ok.g, ok.kvitton, medarbetare.id, nu) : null;

  const kor = async (f: () => Promise<boolean>, efter?: () => void) => {
    setSparar(true); setFel(false);
    const lyckades = await f();
    setSparar(false);
    if (!lyckades) { setFel(true); return; }
    efter?.();
    await las();
  };

  const stang = () => { setValt(null); setAndrar(null); setFel(false); };

  const under = (id: InstrId) => {
    if (!ok || !medarbetare) return null;
    const g = ok.g[id];
    const i = instruktion(id, g);
    const l = lage(id, g, nu);
    if (arAdmin) {
      if (l === 'godkand') return `${i.nar} · Godkänd ${datumText(g.godkandTid!)}`;
      return <>{i.nar} · <span style={{ color: FARG.orange }}>{LAGE_TEXT[l]}</span></>;
    }
    const tid = lastTid(ok.kvitton, medarbetare.id, i);
    return tid ? `${i.nar} · Läst ${datumText(tid)}` : <>{i.nar} · <span style={{ color: FARG.orange }}>Läs</span></>;
  };

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
          <h1 data-testid="sgv-svar" style={{ margin: 0, ...TYP.titel, color: s?.ton ? FARG.orange : FARG.text }}>
            {data === null ? 'Läser …' : data === 'fel' ? 'Kunde inte läsa instruktionerna' : s!.text}
          </h1>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Jobben där det kan gå riktigt illa – så gör vi dem.</p>
          {data === 'fel' && (
            <button type="button" onClick={() => { setData(null); void las(); }} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
          )}
        </header>

        {ok && synliga.length > 0 && (
          <Sektion rubrik="Jobben">
            {synliga.map((id, n) => (
              <Rad key={id} titel={instruktion(id, ok.g[id]).titel} under={under(id)} pil sista={n === synliga.length - 1}
                attr={{ 'data-sgv': id }} onTryck={() => { setFel(false); setValt(id); }} />
            ))}
          </Sektion>
        )}
      </div>

      {valt && ok && medarbetare && (() => {
        const g = ok.g[valt];
        const i = instruktion(valt, g);
        const l = lage(valt, g, nu);
        const tid = lastTid(ok.kvitton, medarbetare.id, i);
        const rensade = andrar ? rensaSteg(andrar) : null;
        const fot = andrar
          ? <button type="button" data-sgv-spara disabled={sparar || !rensade} onClick={() => void kor(() => sparaSteg(supabase, valt, rensade, g), () => setAndrar(null))}
            style={{ ...KNAPP.primar, ...(sparar || !rensade ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Spara'}</button>
          : arAdmin
            ? (l === 'godkand'
              ? <div data-sgv-godkand style={{ ...TYP.text, color: FARG.text2, textAlign: 'center' }}>Godkänd {datumText(g.godkandTid!)}</div>
              : <button type="button" data-sgv-stammer disabled={sparar} onClick={() => void kor(() => godkann(supabase, i, g))} style={KNAPP.primar}>{sparar ? 'Sparar …' : 'Stämmer'}</button>)
            : (tid
              ? <div data-sgv-last style={{ ...TYP.text, color: FARG.text2, textAlign: 'center' }}>Läst {datumText(tid)}</div>
              : <button type="button" data-sgv-las disabled={sparar} onClick={() => void kor(() => kvittera(supabase, medarbetare.id, i))} style={KNAPP.primar}>{sparar ? 'Sparar …' : 'Jag har läst'}</button>);
        return (
          <Ark rubrik={i.titel} onStang={stang} stang={andrar ? 'Avbryt' : 'Klar'}
            fot={<>{fot}{fel && <div role="status" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.s }}>Kunde inte spara. Försök igen.</div>}</>}>
            <p style={{ ...TYP.text, color: FARG.text2, margin: `0 0 ${AVSTAND.l}px` }}>{i.nar}</p>
            {arAdmin && !andrar && l !== 'godkand' && (
              <p data-sgv-lage style={{ ...TYP.text, color: FARG.orange, margin: `0 0 ${AVSTAND.l}px` }}>{LAGE_TEXT[l]}</p>
            )}

            {andrar ? (
              <div data-sgv-andra>
                {Array.from({ length: MAX_STEG }, (_, k) => (
                  <Falt key={k} etikett={`Steg ${k + 1}${k >= 3 ? ' (valfritt)' : ''}`} value={andrar[k] ?? ''}
                    onChange={v => setAndrar(a => { const n = [...(a ?? [])]; n[k] = v; return n; })} />
                ))}
                {!rensade && <p style={{ ...TYP.meta, color: FARG.orange, margin: 0 }}>Minst tre steg.</p>}
              </div>
            ) : (
              <ol data-sgv-steg style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
                {i.steg.map((steg, k) => (
                  <li key={k} style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'flex-start', background: FARG.upphojt, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
                    <span aria-hidden style={{ ...TYP.tal, color: FARG.text, minWidth: AVSTAND.xl, textAlign: 'center' }}>{k + 1}</span>
                    <span style={{ ...TYP.listtitel, color: FARG.text, paddingTop: AVSTAND.xs }}>{steg}</span>
                  </li>
                ))}
              </ol>
            )}

            {!andrar && i.kalla && (
              <a data-sgv-kalla href={i.kalla.url} target="_blank" rel="noopener noreferrer"
                onClick={e => { if (window.open(i.kalla!.url, '_blank', 'noopener')) e.preventDefault(); }}
                style={{ ...TYP.meta, color: FARG.bla, display: 'inline-flex', alignItems: 'center', minHeight: TRAFFYTA.min, marginTop: AVSTAND.m, textDecoration: 'none' }}>
                Källa: {i.kalla.text} ›
              </a>
            )}

            {arAdmin && !andrar && (
              <div style={{ marginTop: AVSTAND.xl, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: AVSTAND.s }}>
                <button type="button" data-sgv-andra-knapp onClick={() => setAndrar([...i.steg])} style={KNAPP.lank}>Ändra stegen</button>
                {arAndrad(valt, g) && (
                  <button type="button" data-sgv-appens disabled={sparar} onClick={() => void kor(() => sparaSteg(supabase, valt, null, g))} style={KNAPP.lank}>
                    Tillbaka till appens text
                  </button>
                )}
              </div>
            )}
          </Ark>
        );
      })()}
    </div>
  );
}

