'use client';

import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { raderaVerifierat, upsertVerifierat } from '@/lib/supabase-save';
import { C, ff, inputStyle, labelStyle } from './tema';
import { arbetsdagar, fmtPeriod, kalenderdagar } from './datum';
import ValjKalender from './ValjKalender';
import type { SchemaMaskin } from './useSchemaData';

const ORSAKER = [
  { varde: 'semesterstopp', label: 'Semesterstopp' },
  { varde: 'produktionsbegransning', label: 'Produktionsbegränsning' },
] as const;

type Orsak = (typeof ORSAKER)[number]['varde'];

/**
 * "Lägg till stopp" — bara för godkännare (chef/admin); RLS spärrar ändå
 * skrivningen för alla andra. "Alla maskiner" expanderas VID SPARNING till
 * de aktiva maskin_id:na och skrivs som explicita stopp_maskin-rader, så
 * historiska stopp fryser rätt maskinuppsättning.
 */
export default function StoppFormular({
  maskiner, egenMedarbetareId, onStang, onSparad,
}: {
  maskiner: SchemaMaskin[];
  egenMedarbetareId: string;
  onStang: () => void;
  onSparad: () => void;
}) {
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [alla, setAlla] = useState(false);
  const [orsak, setOrsak] = useState<Orsak | ''>('');
  const [start, setStart] = useState<string | null>(null);
  const [slut, setSlut] = useState<string | null>(null);
  const [kommentar, setKommentar] = useState('');
  const [sparar, setSparar] = useState(false);
  const [sparfel, setSparfel] = useState<string | null>(null);

  const grupper = useMemo(() => ([
    { rubrik: 'Skördare', maskiner: maskiner.filter(m => m.typ === 'Harvester') },
    { rubrik: 'Skotare', maskiner: maskiner.filter(m => m.typ === 'Forwarder') },
    { rubrik: 'Övriga', maskiner: maskiner.filter(m => m.typ !== 'Harvester' && m.typ !== 'Forwarder') },
  ].filter(g => g.maskiner.length > 0)), [maskiner]);

  const toggla = (id: string) => {
    setAlla(false);
    setValda(prev => {
      const ny = new Set(prev);
      if (ny.has(id)) ny.delete(id); else ny.add(id);
      return ny;
    });
  };

  const effektivtSlut = slut ?? start ?? '';
  const valdaIds = alla ? maskiner.map(m => m.maskin_id) : Array.from(valda);
  const kanSpara = valdaIds.length > 0 && !!orsak && !!start && !sparar;

  const spara = async () => {
    if (!kanSpara || !start) return;
    setSparar(true);
    setSparfel(null);

    // 1) Stopp-raden (verifierad insert, returnerar id)
    const stoppRes = await upsertVerifierat<{ id: string }>(supabase, 'stopp', {
      fran_datum: start,
      till_datum: effektivtSlut,
      orsak,
      kommentar: kommentar || null,
      skapad_av_medarbetare: egenMedarbetareId,
    });
    if (!stoppRes.ok) {
      setSparar(false);
      setSparfel(stoppRes.fel);
      return;
    }
    const stoppId = stoppRes.rows[0].id;

    // 2) Maskinraderna — "Alla" är redan expanderad till explicita id:n
    const maskinRes = await upsertVerifierat(supabase, 'stopp_maskin',
      valdaIds.map(mid => ({ stopp_id: stoppId, maskin_id: mid })));
    if (!maskinRes.ok) {
      // Lämna inget maskinlöst stopp efter oss — rulla tillbaka steg 1
      await raderaVerifierat(supabase, 'stopp', { id: stoppId });
      setSparar(false);
      setSparfel(maskinRes.fel);
      return;
    }

    setSparar(false);
    onSparad();
  };

  const chip = (aktiv: boolean): React.CSSProperties => ({
    padding: '9px 14px', borderRadius: 10,
    border: `1px solid ${aktiv ? C.red : C.border}`,
    background: aktiv ? C.redDim : 'rgba(255,255,255,0.04)',
    color: aktiv ? '#fca5a5' : C.t2,
    fontSize: 13, fontWeight: 500, fontFamily: ff, cursor: 'pointer',
    textAlign: 'left' as const,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: ff }}>
      <div onClick={onStang} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480,
        background: C.surface, borderRadius: '20px 20px 0 0', padding: '24px 20px 32px',
        maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: C.t4, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, marginBottom: 16 }}>Lägg till stopp</div>

        {/* Maskinval — flerval, "Alla" expanderas vid sparning */}
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>MASKINER</div>
          <button type="button" onClick={() => { setAlla(!alla); setValda(new Set()); }}
            style={{ ...chip(alla), width: '100%', marginTop: 6, fontWeight: 600 }}>
            Alla maskiner{alla ? ` — ${maskiner.length} st` : ''}
          </button>
          {grupper.map(g => (
            <div key={g.rubrik} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.t4, marginBottom: 6 }}>
                {g.rubrik}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {g.maskiner.map(m => (
                  <button key={m.maskin_id} type="button" onClick={() => toggla(m.maskin_id)}
                    style={chip(!alla && valda.has(m.maskin_id))}>
                    {m.namn}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Orsak — exakt två val */}
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>ORSAK</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {ORSAKER.map(o => {
              const aktiv = orsak === o.varde;
              return (
                <button key={o.varde} type="button" onClick={() => setOrsak(o.varde)} style={{
                  flex: 1, padding: '11px 0', borderRadius: 12,
                  background: aktiv ? '#fff' : 'rgba(255,255,255,0.06)',
                  border: aktiv ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  color: aktiv ? '#111' : '#fff',
                  fontSize: 13, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Datum — samma tryck-kalender som ansök-flödet */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '12px 10px 8px', marginBottom: 10,
        }}>
          <ValjKalender valdStart={start} valdSlut={slut} onValj={(s, e) => { setStart(s); setSlut(e); }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 30, marginBottom: 12 }}>
          {start ? (
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{fmtPeriod(start, effektivtSlut)}</span>
              <span style={{ fontSize: 12, color: C.t3, marginLeft: 8 }}>
                {kalenderdagar(start, effektivtSlut)} dagar ({arbetsdagar(start, effektivtSlut)} arbetsdagar)
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: C.t3 }}>Tryck på en dag i kalendern</span>
          )}
          {start && (
            <button type="button" onClick={() => { setStart(null); setSlut(null); }}
              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.t2, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: ff, padding: '6px 12px', flexShrink: 0 }}>
              Rensa
            </button>
          )}
        </div>

        {/* Kommentar */}
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>KOMMENTAR</div>
          <input placeholder='Valfritt — t.ex. "fullt gallringslager"' value={kommentar}
            onChange={e => setKommentar(e.target.value)} style={inputStyle} />
        </div>

        {sparfel && (
          <div style={{ padding: '12px 14px', background: C.redDim, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: C.red, lineHeight: 1.4 }}>{sparfel}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onStang} style={{ background: 'none', border: 'none', color: C.t2, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: ff, padding: '10px 16px' }}>
            Avbryt
          </button>
          <button onClick={spara} disabled={!kanSpara} style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: C.red, color: '#fff',
            fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
            opacity: kanSpara ? 1 : 0.5,
          }}>
            {sparar ? 'Sparar...' : 'Spara stopp'}
          </button>
        </div>
      </div>
    </div>
  );
}
