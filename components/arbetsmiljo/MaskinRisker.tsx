'use client';

// Riskbedömning per maskintyp — svarar på EN fråga: "Vet alla vad som är farligt med maskinen och vad man gör?".
// En rad per maskintyp. Ett tryck öppnar riskerna: admin tar bort det som inte gäller, lägger till egna och trycker Stämmer;
// föraren läser och trycker "Jag har läst". Reglerna och texterna: lib/arbetsmiljo/maskinRisk.ts.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Falt from '@/components/design/Falt';
import { AVSTAND, FARG, KNAPP, RADIE, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { datumText } from '@/lib/arbetsmiljo/introduktion';
import {
  MASKINTYPER, TYP_NAMN, antalText, borttagna, godkann, hamtaBedomningar, hamtaKvitton, kvittera, lage, laggTill, lastTid, lista,
  sparaListan, synligForForare, taBort, taTillbaka, typForMaskin, underlag,
  type Bedomning, type Kvitto, type Lage, type MaskinRisk, type MaskinTyp,
} from '@/lib/arbetsmiljo/maskinRisk';

type Forare = { id: string; namn: string; typ: MaskinTyp | null };
type Data = {
  bedomningar: Record<MaskinTyp, Bedomning>;
  kvitton: Kvitto[];
  /** Den inloggades maskintyp (förare). */
  minTyp: MaskinTyp | null;
  /** Admin: aktiva förare och deras maskintyp, för "Har inte läst". null = kunde inte läsas. */
  forare: Forare[] | null;
};

const fornamn = (n: string) => n.trim().split(/\s+/)[0] ?? n;

const LAGE_TEXT: Record<Lage, string> = {
  godkand: 'Godkänd', se_over: 'Godkänd för över ett år sedan – se över', andrad: 'Ändrad – godkänn igen', aldrig: 'Inte godkänd',
};

export default function MaskinRisker() {
  const { medarbetare } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';
  const [data, setData] = useState<Data | null | 'fel'>(null);
  const [valt, setValt] = useState<MaskinTyp | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);
  const [ny, setNy] = useState(false);
  const [nyRisk, setNyRisk] = useState('');
  const [nyAtgard, setNyAtgard] = useState('');

  const hamta = useCallback(async () => {
    if (!medarbetare) return;
    try {
      const [bedomningar, kvitton, maskiner] = await Promise.all([
        hamtaBedomningar(supabase),
        hamtaKvitton(supabase),
        supabase.from('dim_maskin').select('maskin_id, maskin_typ').then(r => (r.error ? null : (r.data as { maskin_id: string; maskin_typ: string | null }[]))),
      ]);
      if (!bedomningar || !kvitton) { setData('fel'); return; }
      const typAv = (maskinId: string | null) => typForMaskin(maskiner?.find(m => m.maskin_id === maskinId)?.maskin_typ);
      let forare: Forare[] | null = null;
      if (arAdmin) {
        const { data: rader, error } = await supabase.from('medarbetare').select('id, namn, roll, aktiv, maskin_id, foretagsledare');
        if (!error && Array.isArray(rader) && maskiner) {
          forare = (rader as { id: string; namn: string; roll: string; aktiv: boolean; maskin_id: string | null; foretagsledare: boolean | null }[])
            .filter(r => r.aktiv && r.roll === 'forare' && r.foretagsledare !== true)
            .map(r => ({ id: r.id, namn: r.namn, typ: typAv(r.maskin_id) }));
        }
      }
      setData({ bedomningar, kvitton, minTyp: typAv(medarbetare.maskin_id), forare });
    } catch { setData('fel'); }
  }, [medarbetare, arAdmin]);

  useEffect(() => { hamta(); }, [hamta]);

  const nu = new Date();
  const ok = data && data !== 'fel' ? data : null;

  // Vad föraren ser: bara godkända. Sin egen maskin först.
  const typer = ok ? (arAdmin ? MASKINTYPER : MASKINTYPER.filter(t => synligForForare(lage(t, ok.bedomningar[t], nu))))
    .slice().sort((a, b) => (a === ok.minTyp ? -1 : b === ok.minTyp ? 1 : 0)) : [];

  const svar = (() => {
    if (data === null) return 'Läser …';
    if (data === 'fel') return 'Kunde inte läsa riskbedömningen.';
    if (arAdmin) {
      const att = MASKINTYPER.filter(t => lage(t, data.bedomningar[t], nu) !== 'godkand').length;
      return att === 0 ? 'Alla är godkända · Se över varje år' : `${att} av ${MASKINTYPER.length} att godkänna`;
    }
    if (!data.minTyp) return 'Det farliga med maskinerna och vad du gör';
    const b = data.bedomningar[data.minTyp];
    if (!synligForForare(lage(data.minTyp, b, nu))) return 'Riskbedömningen för din maskin är inte klar än';
    return lastTid(data.kvitton, medarbetare!.id, data.minTyp, underlag(lista(data.minTyp, b))) ? 'Du har läst riskerna för din maskin ✓' : 'Läs riskerna för din maskin';
  })();

  const spara = async (typ: MaskinTyp, b: Bedomning) => {
    if (!ok) return;
    setSparar(true); setFel(false);
    const lyckades = await sparaListan(supabase, typ, b);
    setSparar(false);
    if (!lyckades) { setFel(true); return; }
    setData({ ...ok, bedomningar: { ...ok.bedomningar, [typ]: b } });
  };

  const stammer = async () => {
    if (!ok || !valt) return;
    setSparar(true); setFel(false);
    const lyckades = await godkann(supabase, valt, ok.bedomningar[valt]);
    setSparar(false);
    if (!lyckades) { setFel(true); return; }
    await hamta();
  };

  const las = async () => {
    if (!ok || !valt || !medarbetare) return;
    setSparar(true); setFel(false);
    const lyckades = await kvittera(supabase, medarbetare.id, valt, underlag(lista(valt, ok.bedomningar[valt])));
    setSparar(false);
    if (!lyckades) { setFel(true); return; }
    await hamta();
  };

  const radUnder = (t: MaskinTyp): ReactNode => {
    if (!ok) return null;
    const b = ok.bedomningar[t];
    const l = lage(t, b, nu);
    const n = antalText(lista(t, b).length);
    if (arAdmin) {
      if (l === 'godkand') return `${n} · Godkänd ${datumText(b.godkandTid!)}`;
      return <>{n} · <span style={{ color: FARG.orange }}>{LAGE_TEXT[l]}</span></>;
    }
    const tid = lastTid(ok.kvitton, medarbetare!.id, t, underlag(lista(t, b)));
    const egen = t === ok.minTyp ? 'Din maskin · ' : '';
    return tid ? `${egen}${n} · Läst ${datumText(tid)}` : <>{egen}{n} · <span style={{ color: t === ok.minTyp ? FARG.orange : FARG.text2 }}>Läs</span></>;
  };

  const stang = () => { setValt(null); setNy(false); setNyRisk(''); setNyAtgard(''); setFel(false); };

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
          <h1 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>Riskbedömning</h1>
          <div data-testid="mr-svar" style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{svar}</div>
          {data === 'fel' && <button type="button" onClick={() => { setData(null); hamta(); }} style={{ ...KNAPP.lank, marginTop: AVSTAND.s }}>Försök igen</button>}
        </header>

        {ok && (
          <Sektion rubrik="Maskiner" not={arAdmin ? 'Riskerna på varje trakt bedöms i planeringen. Här står det som gäller själva maskinen.' : undefined}>
            {typer.length === 0
              ? <div style={{ ...TYP.text, color: FARG.text2, padding: AVSTAND.l }}>Ingen riskbedömning är klar än.</div>
              : typer.map((t, i) => (
                <Rad key={t} titel={TYP_NAMN[t]} under={radUnder(t)} onTryck={() => { setFel(false); setValt(t); }}
                  sista={i === typer.length - 1} attr={{ 'data-testid': `mr-typ-${t}` }} />
              ))}
          </Sektion>
        )}
      </div>

      {valt && ok && (() => {
        const b = ok.bedomningar[valt];
        const risker = lista(valt, b);
        const l = lage(valt, b, nu);
        const u = underlag(risker);
        const tid = medarbetare ? lastTid(ok.kvitton, medarbetare.id, valt, u) : null;
        const lasta = arAdmin && ok.forare ? ok.forare.filter(f => f.typ === valt) : [];
        const fot = arAdmin
          ? (l === 'godkand'
            ? <div data-testid="mr-godkand" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center' }}>Godkänd {datumText(b.godkandTid!)}</div>
            : <button type="button" data-testid="mr-stammer" disabled={sparar} onClick={stammer} style={{ ...KNAPP.primar, width: '100%' }}>{sparar ? 'Sparar …' : 'Stämmer'}</button>)
          : (tid
            ? <div data-testid="mr-last" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center' }}>Läst {datumText(tid)}</div>
            : <button type="button" data-testid="mr-las" disabled={sparar} onClick={las} style={{ ...KNAPP.primar, width: '100%' }}>{sparar ? 'Sparar …' : 'Jag har läst'}</button>);
        return (
          <Ark rubrik={TYP_NAMN[valt]} onStang={stang} stang={arAdmin || tid ? 'Klar' : 'Avbryt'}
            fot={<>{fot}{fel && <div role="status" data-testid="mr-fel" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.s }}>Kunde inte spara. Försök igen.</div>}</>}>
            <div data-testid="mr-ark">
              {arAdmin && l !== 'godkand' && (
                <div data-testid="mr-lage" style={{ ...TYP.text, color: FARG.orange, marginBottom: AVSTAND.l }}>{LAGE_TEXT[l]}</div>
              )}
              <RiskLista risker={risker} hoger={arAdmin ? (r) => (
                <button type="button" data-testid={`mr-bort-${r.nyckel}`} disabled={sparar} onClick={() => spara(valt, taBort(b, r.nyckel))}
                  style={{ ...KNAPP.tertiar, minHeight: TRAFFYTA.min, flexShrink: 0 }}>{r.egen ? 'Ta bort' : 'Gäller inte'}</button>
              ) : undefined} />

              {arAdmin && (
                <div style={{ marginTop: AVSTAND.l }}>
                  {ny ? (
                    <div data-testid="mr-ny" style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
                      <Falt etikett="Vad är risken?" value={nyRisk} onChange={setNyRisk} placeholder="T.ex. Kabel till motorvärmaren" autoFocus />
                      <Falt etikett="Vad gör man?" value={nyAtgard} onChange={setNyAtgard} placeholder="T.ex. Dra ut kabeln innan du kör" />
                      <div style={{ display: 'flex', gap: AVSTAND.s }}>
                        <button type="button" onClick={() => { setNy(false); setNyRisk(''); setNyAtgard(''); }} style={{ ...KNAPP.sekundar, flex: 1 }}>Avbryt</button>
                        <button type="button" data-testid="mr-ny-lagg" disabled={!nyRisk.trim() || !nyAtgard.trim() || sparar}
                          onClick={async () => {
                            const nb = laggTill(b, crypto.randomUUID(), nyRisk, nyAtgard);
                            if (!nb) return;
                            await spara(valt, nb);
                            setNy(false); setNyRisk(''); setNyAtgard('');
                          }}
                          style={{ ...KNAPP.sekundar, flex: 1, ...(!nyRisk.trim() || !nyAtgard.trim() ? { opacity: 0.4 } : null) }}>Lägg till</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" data-testid="mr-lagg-till" onClick={() => setNy(true)} style={{ ...KNAPP.lank, minHeight: TRAFFYTA.min }}>+ Lägg till en risk</button>
                  )}
                </div>
              )}

              {arAdmin && borttagna(valt, b).length > 0 && (
                <div style={{ marginTop: AVSTAND.xl }}>
                  <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>GÄLLER INTE HOS OSS</div>
                  <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                    {borttagna(valt, b).map((r, k) => (
                      <div key={r.nyckel} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderTop: k === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                        <span style={{ flex: 1, ...TYP.text, color: FARG.text2 }}>{r.risk}</span>
                        <button type="button" data-testid={`mr-tillbaka-${r.nyckel}`} disabled={sparar} onClick={() => spara(valt, taTillbaka(b, r.nyckel))}
                          style={{ ...KNAPP.tertiar, minHeight: TRAFFYTA.min }}>Ta tillbaka</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {arAdmin && l === 'godkand' && ok.forare && (
                <div data-testid="mr-lasta" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xl }}>
                  {lasta.length === 0 ? 'Ingen förare har den här maskintypen.' : lasta.map(f => {
                    const t = lastTid(ok.kvitton, f.id, valt, u);
                    return t ? `${fornamn(f.namn)} läste ${datumText(t)}` : `${fornamn(f.namn)} har inte läst`;
                  }).join(' · ')}
                </div>
              )}
            </div>
          </Ark>
        );
      })()}
    </div>
  );
}

function RiskLista({ risker, hoger }: { risker: MaskinRisk[]; hoger?: (r: MaskinRisk) => ReactNode }) {
  if (risker.length === 0) return <div style={{ ...TYP.text, color: FARG.text2 }}>Inga risker kvar. Lägg till eller ta tillbaka.</div>;
  return (
    <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, overflow: 'hidden' }}>
      {risker.map((r, k) => (
        <div key={r.nyckel} data-testid={`mr-risk-${r.nyckel}`} style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: k === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYP.listtitel, color: FARG.text }}>{r.risk}</div>
            <div style={{ ...TYP.text, color: FARG.text, marginTop: AVSTAND.xs }}>{r.atgard}</div>
          </div>
          {hoger?.(r)}
        </div>
      ))}
    </div>
  );
}
