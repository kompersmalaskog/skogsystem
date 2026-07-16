'use client';

// MATCHNINGSVYN (steg 3 av redigeringsomdesignen): stämmer maskinernas
// objekt med de planerade? Tre sektioner:
//   ⚠ Maskinobjekt utan planering  -> Koppla / Skapa / Ignorera
//   ⚠ Planerade utan maskindata    -> Koppla
//   ✓ Kopplade par                 -> källa (FK eller VO) + Lås för VO-par
//
// Koppla fyller objekt.dim_objekt_id — FK:n är sanningskällan; exakt
// VO-likhet är legacy-fallback som kan "låsas" till FK med ett klick.
// Skapa länkar till /starta-jobb?objekt=<id> (EN födelseväg — ingen
// dubblering av skapandeflödet här).
// Ärlig sparning genomgående: .select() + räkna träffade rader.

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MatchningData, MaskinObjektKort, PlaneratKort } from './hooks/useMatchning';

const FF = "'Geist', system-ui, sans-serif";

async function sattKoppling(planeratId: string, dimObjektId: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase
    .from('objekt')
    .update({ dim_objekt_id: dimObjektId })
    .eq('id', planeratId)
    .select('id');
  if (error) return { ok: false, message: 'Kunde inte koppla: ' + error.message };
  if (!data || data.length === 0) return { ok: false, message: 'Inget sparades — kopplingen sattes inte' };
  return { ok: true, message: '' };
}

async function ignoreraMaskinObjekt(dimObjektId: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase
    .from('dim_objekt')
    .update({ exkludera: true })
    .eq('objekt_id', dimObjektId)
    .select('objekt_id');
  if (error) return { ok: false, message: 'Kunde inte ignorera: ' + error.message };
  if (!data || data.length === 0) return { ok: false, message: 'Inget sparades — objektet ignorerades inte' };
  return { ok: true, message: '' };
}

function MaskinMeta({ kort }: { kort: MaskinObjektKort }) {
  const meta: string[] = [];
  // maskiner-listan typas i #177 — läs tolerant tills den är mergad
  const maskiner = (kort as any).maskiner as { id: string; modell: string | null }[] | undefined;
  if (maskiner?.length) meta.push(maskiner.map(m => m.modell || m.id).join(', '));
  else if (kort.maskinModell) meta.push(kort.maskinModell);
  if (kort.senasteAktivitet) meta.push(`senast ${kort.senasteAktivitet}`);
  if (kort.skordatM3 > 0) meta.push(`${kort.skordatM3.toLocaleString('sv-SE')} m³ skördat`);
  if (kort.skotatM3 > 0) meta.push(`${kort.skotatM3.toLocaleString('sv-SE')} m³ skotat`);
  return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{meta.join(' · ') || 'Ingen aktivitet registrerad'}</div>;
}

// Enkel väljar-overlay med sök — används för båda kopplingsriktningarna
function Valjare({ titel, rader, onVal, onStang }: {
  titel: string;
  rader: { id: string; namn: string; under: string }[];
  onVal: (id: string) => void;
  onStang: () => void;
}) {
  const [sok, setSok] = useState('');
  const synliga = sok.trim()
    ? rader.filter(r => (r.namn + ' ' + r.under).toLowerCase().includes(sok.toLowerCase()))
    : rader;
  return (
    <>
      <div onClick={onStang} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 32px)', maxWidth: 440, maxHeight: '70vh', background: '#1a1a18', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', zIndex: 201, display: 'flex', flexDirection: 'column', fontFamily: FF, color: '#e8e8e4' }}>
        <div style={{ padding: '16px 18px 10px', fontSize: 15, fontWeight: 600 }}>{titel}</div>
        <div style={{ padding: '0 14px 10px' }}>
          <input
            autoFocus
            value={sok}
            onChange={e => setSok(e.target.value)}
            placeholder="Sök…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, outline: 'none', fontFamily: FF }}
          />
        </div>
        <div style={{ overflowY: 'auto', padding: '0 8px 12px' }}>
          {synliga.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Inga träffar</div>
          )}
          {synliga.map(r => (
            <button key={r.id} onClick={() => onVal(r.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontFamily: FF }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.namn}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.under}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default function MatchningsVy({ matchning, onBack }: { matchning: MatchningData; onBack: () => void }) {
  const [fel, setFel] = useState('');
  const [arbetar, setArbetar] = useState(false);
  // Väljarläge: koppla maskinobjekt -> välj planerat, eller tvärtom
  const [valjPlaneratFor, setValjPlaneratFor] = useState<MaskinObjektKort | null>(null);
  const [valjMaskinFor, setValjMaskinFor] = useState<PlaneratKort | null>(null);

  const kor = async (aktion: Promise<{ ok: boolean; message: string }>) => {
    setArbetar(true);
    setFel('');
    const r = await aktion;
    if (!r.ok) setFel(r.message);
    else matchning.uppdatera();
    setArbetar(false);
  };

  const s = {
    sida: { background: '#111110', minHeight: '100vh', paddingBottom: 120, color: '#e8e8e4', fontFamily: FF } as const,
    rubrik: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', margin: '20px 16px 10px' },
    kort: { background: '#1a1a18', borderRadius: 14, padding: 14, margin: '0 16px 10px' } as const,
    knapp: { minHeight: 40, padding: '0 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: FF, cursor: 'pointer' } as const,
  };

  return (
    <div style={s.sida}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 16px 0' }}>
        <button onClick={onBack} style={{ ...s.knapp, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.7)' }}>‹ Objekt</button>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Matchning</div>
      </div>
      <div style={{ fontSize: 12, color: '#7a7a72', padding: '6px 16px 0' }}>
        Stämmer maskinernas objekt med de planerade? Koppla fyller den riktiga kopplingen (dim_objekt_id).
      </div>

      {fel && (
        <div style={{ margin: '12px 16px 0', padding: '10px 12px', background: 'rgba(255,90,90,0.08)', border: '1px solid rgba(255,90,90,0.3)', color: 'rgba(255,160,160,0.95)', borderRadius: 10, fontSize: 12 }}>{fel}</div>
      )}

      {matchning.status === 'laddar' && <div style={{ textAlign: 'center', padding: 60, color: '#7a7a72' }}>Laddar…</div>}
      {matchning.status === 'fel' && <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,160,160,0.9)' }}>Kunde inte läsa matchningsdata. Försök igen.</div>}

      {matchning.status === 'ok' && (
        <>
          <div style={s.rubrik}>⚠ Maskinobjekt utan planering · {matchning.omatchadeMaskin.length}</div>
          {matchning.omatchadeMaskin.length === 0 && (
            <div style={{ ...s.kort, color: '#7a7a72', fontSize: 13 }}>Alla maskinobjekt är kopplade.</div>
          )}
          {matchning.omatchadeMaskin.map(kort => (
            <div key={kort.objektId} style={s.kort}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: kort.namn ? '#fff' : '#FF9F0A' }}>
                {kort.namn || 'Namnlöst objekt'}
                {kort.voNummer && <span style={{ fontSize: 11, color: '#7a7a72', fontWeight: 400 }}> · VO {kort.voNummer}</span>}
              </div>
              <MaskinMeta kort={kort} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button disabled={arbetar} onClick={() => setValjPlaneratFor(kort)} style={{ ...s.knapp, flex: 1, border: 'none', background: '#adc6ff', color: '#000' }}>Koppla</button>
                <button disabled={arbetar} onClick={() => { window.location.href = `/starta-jobb?objekt=${encodeURIComponent(kort.objektId)}`; }} style={{ ...s.knapp, flex: 1, border: '1px solid rgba(90,255,140,0.35)', background: 'rgba(90,255,140,0.08)', color: 'rgba(90,255,140,0.9)' }}>Skapa</button>
                <button disabled={arbetar} onClick={() => kor(ignoreraMaskinObjekt(kort.objektId))} style={{ ...s.knapp, flex: 1, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)' }}>Ignorera</button>
              </div>
            </div>
          ))}

          <div style={s.rubrik}>⚠ Planerade utan maskindata · {matchning.utanMaskindata.length}</div>
          {matchning.utanMaskindata.length === 0 && (
            <div style={{ ...s.kort, color: '#7a7a72', fontSize: 13 }}>Alla planerade objekt har maskindata.</div>
          )}
          {matchning.utanMaskindata.map(p => (
            <div key={p.id} style={s.kort}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                {p.namn || 'Namnlöst objekt'}
                {p.voNummer && <span style={{ fontSize: 11, color: '#7a7a72', fontWeight: 400 }}> · VO {p.voNummer}</span>}
              </div>
              <div style={{ fontSize: 12, color: '#7a7a72' }}>{p.status ? `Status: ${p.status}` : 'Ingen status'} · väntar på maskinfiler{p.voNummer ? ` — VO ${p.voNummer} kopplar automatiskt` : ''}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button disabled={arbetar} onClick={() => setValjMaskinFor(p)} style={{ ...s.knapp, flex: 1, border: 'none', background: '#adc6ff', color: '#000' }}>Koppla till maskinobjekt</button>
              </div>
            </div>
          ))}

          <div style={s.rubrik}>✓ Kopplade · {matchning.matchade.length}</div>
          {matchning.matchade.map(par => {
            const viaFk = par.planerat.dimObjektId === par.maskin.objektId;
            return (
              <div key={par.maskin.objektId} style={{ ...s.kort, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{par.maskin.namn || 'Namnlöst'} ↔ {par.planerat.namn || 'Namnlöst'}</div>
                  <div style={{ fontSize: 11, color: '#7a7a72' }}>{viaFk ? 'Kopplad (dim_objekt_id)' : `Matchad via VO ${par.maskin.voNummer}`}</div>
                </div>
                {!viaFk && (
                  <button disabled={arbetar} onClick={() => kor(sattKoppling(par.planerat.id, par.maskin.objektId))} style={{ ...s.knapp, border: '1px solid rgba(173,198,255,0.35)', background: 'rgba(173,198,255,0.1)', color: '#adc6ff' }}>Lås</button>
                )}
              </div>
            );
          })}
        </>
      )}

      {valjPlaneratFor && (
        <Valjare
          titel={`Koppla "${valjPlaneratFor.namn || 'Namnlöst objekt'}" till planerat objekt`}
          rader={[...matchning.utanMaskindata, ...matchning.matchade.map(p => p.planerat)].map(p => ({
            id: p.id, namn: p.namn || 'Namnlöst objekt', under: [p.voNummer && `VO ${p.voNummer}`, p.status].filter(Boolean).join(' · '),
          }))}
          onVal={(id) => { const kort = valjPlaneratFor; setValjPlaneratFor(null); kor(sattKoppling(id, kort.objektId)); }}
          onStang={() => setValjPlaneratFor(null)}
        />
      )}
      {valjMaskinFor && (
        <Valjare
          titel={`Koppla "${valjMaskinFor.namn || 'Namnlöst objekt'}" till maskinobjekt`}
          rader={matchning.omatchadeMaskin.map(k => ({
            id: k.objektId,
            namn: k.namn || 'Namnlöst objekt',
            under: [((k as any).maskiner || []).map((m: any) => m.modell || m.id).join(', ') || k.maskinModell, k.senasteAktivitet && `senast ${k.senasteAktivitet}`].filter(Boolean).join(' · '),
          }))}
          onVal={(id) => { const p = valjMaskinFor; setValjMaskinFor(null); kor(sattKoppling(p.id, id)); }}
          onStang={() => setValjMaskinFor(null)}
        />
      )}
    </div>
  );
}
