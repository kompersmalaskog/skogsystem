'use client';

// STARTA JOBB — den ENDA födelsevägen för objekt (Martins beslut: /objekt-vyns
// eget skapande är borttaget och länkar hit).
//
// Två ingångar till samma flöde:
//  1) NYTT OBJEKT (i förväg): namn/markägare/bolag/typ -> objekt-rad skapas
//     + P-VO visas stort -> föraren knappar in VO:t i BÅDA maskinerna ->
//     importens VO-koppling limmar ihop när filerna kommer.
//  2) MASKINOBJEKT (i efterhand): dim_objekt utan VO -> P-VO sätts på
//     maskinraden + objekt-rad skapas med dim_objekt_id-koppling direkt.
//     ?objekt=<id> förväljer (matchningsvyns "Skapa" länkar hit).
//
// Ärlig sparning genomgående: .select() + räkna träffade rader; RPC-fel
// visas, aldrig tyst retur. Delvis misslyckande (VO satt men objekt-rad
// saknas) redovisas i klartext.

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

const C = {
  bg: '#09090b', card: '#131315', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.45)', t4: 'rgba(255,255,255,0.2)',
  green: '#22c55e', red: '#ef4444', amber: '#f59e0b',
};
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif";

interface DimObjekt {
  objekt_id: string;
  object_name: string | null;
  vo_nummer: string | null;
  skogsagare: string | null;
  bolag: string | null;
  huvudtyp: string | null;
}

interface Resultat {
  namn: string;
  vo_nummer: string;
  varning: string | null; // delvis misslyckande — redovisas, döljs aldrig
}

type Flik = 'nytt' | 'maskin' | 'tilldelade';

export default function StartaJobbPage() {
  const [objekt, setObjekt] = useState<DimObjekt[]>([]);
  const [tilldelade, setTilldelade] = useState<{ nyckel: string; namn: string; vo: string; agare: string | null; bolag: string | null }[]>([]);
  const [sok, setSok] = useState('');
  const [flik, setFlik] = useState<Flik>('nytt');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fel, setFel] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [visaVo, setVisaVo] = useState<{ namn: string; vo: string } | null>(null);
  const [forvalt, setForvalt] = useState<string | null>(null); // ?objekt=<id>

  // Nytt objekt-formuläret
  const [nyNamn, setNyNamn] = useState('');
  const [nyMarkagare, setNyMarkagare] = useState('');
  const [nyBolag, setNyBolag] = useState('');
  const [nyTyp, setNyTyp] = useState<'slutavverkning' | 'gallring'>('slutavverkning');

  useEffect(() => {
    // ?objekt=<id> läses utan useSearchParams (slipper Suspense-kravet)
    try {
      const id = new URLSearchParams(window.location.search).get('objekt');
      if (id) { setForvalt(id); setFlik('maskin'); }
    } catch {}

    (async () => {
      try {
        const [utanVo, dimTilldelade, objTilldelade] = await Promise.all([
          supabase.from('dim_objekt')
            .select('objekt_id, object_name, vo_nummer, skogsagare, bolag, huvudtyp')
            .or('vo_nummer.is.null,vo_nummer.eq.')
            .order('object_name'),
          supabase.from('dim_objekt')
            .select('objekt_id, object_name, vo_nummer, skogsagare, bolag, huvudtyp')
            .like('vo_nummer', 'P-%')
            .order('object_name'),
          supabase.from('objekt')
            .select('id, namn, vo_nummer, markagare, bolag')
            .like('vo_nummer', 'P-%'),
        ]);
        if (utanVo.error) { setError(`Databasfel: ${utanVo.error.message}`); setLoading(false); return; }
        setObjekt(utanVo.data || []);

        // Tilldelade = union av maskinobjekt med P-VO och planerade objekt
        // med P-VO (nyskapade utan maskindata ännu), dedupe på VO
        const rader = new Map<string, { nyckel: string; namn: string; vo: string; agare: string | null; bolag: string | null }>();
        (objTilldelade.data || []).forEach((o: any) => {
          if (o.vo_nummer) rader.set(o.vo_nummer, { nyckel: 'obj-' + o.id, namn: o.namn || 'Namnlöst objekt', vo: o.vo_nummer, agare: o.markagare, bolag: o.bolag });
        });
        (dimTilldelade.data || []).forEach((o: any) => {
          if (o.vo_nummer) rader.set(o.vo_nummer, { nyckel: 'dim-' + o.objekt_id, namn: o.object_name || 'Namnlöst objekt', vo: o.vo_nummer, agare: o.skogsagare, bolag: o.bolag });
        });
        setTilldelade(Array.from(rader.values()).sort((a, b) => a.namn.localeCompare(b.namn, 'sv')));
      } catch (err: any) {
        setError(`Nätverksfel: ${err.message}`);
      }
      setLoading(false);
    })();
  }, []);

  const lista = useMemo(() => {
    if (!sok.trim()) return objekt;
    const t = sok.toLowerCase();
    return objekt.filter(o =>
      (o.object_name || '').toLowerCase().includes(t) ||
      (o.skogsagare || '').toLowerCase().includes(t) ||
      (o.bolag || '').toLowerCase().includes(t)
    );
  }, [objekt, sok]);

  const tilldeladeLista = useMemo(() => {
    if (!sok.trim()) return tilldelade;
    const t = sok.toLowerCase();
    return tilldelade.filter(o =>
      o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) ||
      (o.bolag || '').toLowerCase().includes(t) || o.vo.toLowerCase().includes(t)
    );
  }, [tilldelade, sok]);

  const hamtaVo = async (): Promise<string | null> => {
    const { data: vo, error: rpcErr } = await supabase.rpc('next_privat_vo');
    if (rpcErr || !vo) {
      setFel('Kunde inte hämta VO-nummer' + (rpcErr ? `: ${rpcErr.message}` : ' — inget svar från databasen'));
      return null;
    }
    return vo as string;
  };

  // Ingång 1: nytt objekt i förväg — objekt-rad + P-VO
  const skapaNyttObjekt = async () => {
    if (saving) return;
    setFel('');
    if (!nyNamn.trim()) { setFel('Objektet behöver ett namn'); return; }
    setSaving(true);

    const vo = await hamtaVo();
    if (!vo) { setSaving(false); return; }

    const { data, error: insErr } = await supabase.from('objekt').insert({
      namn: nyNamn.trim(),
      vo_nummer: vo,
      markagare: nyMarkagare.trim() || null,
      bolag: nyBolag.trim() || null,
      typ: nyTyp,
      kalla: 'starta-jobb',
    }).select('id');
    if (insErr || !data || data.length === 0) {
      setFel('Objektet kunde inte skapas' + (insErr ? `: ${insErr.message}` : ' — inga rader sparades'));
      setSaving(false);
      return;
    }

    setTilldelade(prev => [{ nyckel: 'obj-' + data[0].id, namn: nyNamn.trim(), vo, agare: nyMarkagare.trim() || null, bolag: nyBolag.trim() || null }, ...prev]);
    setResultat({ namn: nyNamn.trim(), vo_nummer: vo, varning: null });
    setNyNamn(''); setNyMarkagare(''); setNyBolag('');
    setSaving(false);
  };

  // Ingång 2: befintligt maskinobjekt — P-VO på dim-raden + objekt-rad med FK
  const tilldelaMaskinObjekt = async (obj: DimObjekt) => {
    if (saving) return;
    setFel('');
    setSaving(true);

    const vo = await hamtaVo();
    if (!vo) { setSaving(false); return; }

    const { data: dimRows, error: dimErr } = await supabase
      .from('dim_objekt')
      .update({ vo_nummer: vo })
      .eq('objekt_id', obj.objekt_id)
      .select('objekt_id');
    if (dimErr || !dimRows || dimRows.length === 0) {
      setFel('Inget sparades — VO-numret sattes inte på maskinobjektet' + (dimErr ? `: ${dimErr.message}` : ''));
      setSaving(false);
      return;
    }

    // Planeringsraden — med FK-koppling (dim_objekt_id) direkt
    const typ = (obj.huvudtyp || '').toLowerCase().includes('gallr') ? 'gallring'
      : (obj.huvudtyp || '').toLowerCase().includes('slut') ? 'slutavverkning' : null;
    const { data: objRows, error: objErr } = await supabase.from('objekt').insert({
      namn: obj.object_name || null,
      vo_nummer: vo,
      markagare: obj.skogsagare || null,
      bolag: obj.bolag || null,
      ...(typ ? { typ } : {}),
      dim_objekt_id: obj.objekt_id,
      kalla: 'starta-jobb',
    }).select('id');

    // Delvis misslyckande redovisas — VO:t är satt men planeringsraden saknas
    const varning = (objErr || !objRows || objRows.length === 0)
      ? 'OBS: VO-numret är satt på maskinobjektet, men planeringsraden kunde inte skapas — objektet syns inte i Objekt-vyn. Försök igen eller kontakta admin.'
      : null;

    setObjekt(prev => prev.filter(o => o.objekt_id !== obj.objekt_id));
    setTilldelade(prev => [{ nyckel: 'dim-' + obj.objekt_id, namn: obj.object_name || 'Namnlöst objekt', vo, agare: obj.skogsagare, bolag: obj.bolag }, ...prev]);
    setResultat({ namn: obj.object_name || 'Namnlöst objekt', vo_nummer: vo, varning });
    setForvalt(null);
    setSaving(false);
  };

  const knappStil = (aktiv: boolean) => ({
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: aktiv ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: aktiv ? C.t1 : C.t3, fontSize: 14, fontWeight: aktiv ? 600 : 400,
    cursor: 'pointer', fontFamily: ff,
  } as const);

  const faltStil = {
    width: '100%', padding: '14px 16px', borderRadius: 12, boxSizing: 'border-box' as const,
    border: '1px solid ' + C.border, background: 'rgba(255,255,255,0.05)',
    color: C.t1, fontSize: 16, outline: 'none', fontFamily: ff,
  };

  // ── VO-visning för tidigare tilldelat ──
  if (visaVo) {
    return (
      <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: C.bg, color: C.t1, fontFamily: ff, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ fontSize: 14, color: C.t3, marginBottom: 8 }}>{visaVo.namn}</div>
        <div style={{ fontSize: 15, color: C.t2, marginBottom: 24 }}>VO-nummer:</div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-1px', marginBottom: 40, color: C.green }}>{visaVo.vo}</div>
        <button onClick={() => setVisaVo(null)} style={{ padding: '16px 48px', borderRadius: 14, border: 'none', background: C.green, color: '#000', fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
          Tillbaka
        </button>
      </div>
    );
  }

  // ── Resultatvy efter skapande/tilldelning ──
  if (resultat) {
    return (
      <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: C.bg, color: C.t1, fontFamily: ff, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ fontSize: 14, color: C.t3, marginBottom: 8 }}>{resultat.namn}</div>
        <div style={{ fontSize: 15, color: C.t2, marginBottom: 24, textAlign: 'center' }}>Mata in detta nummer i terminalen — i båda maskinerna:</div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-1px', marginBottom: 24, color: C.green }}>{resultat.vo_nummer}</div>
        {resultat.varning && (
          <div style={{ maxWidth: 420, textAlign: 'center', fontSize: 13, color: C.amber, marginBottom: 24, lineHeight: 1.5 }}>{resultat.varning}</div>
        )}
        <button onClick={() => setResultat(null)} style={{ padding: '16px 48px', borderRadius: 14, border: 'none', background: C.green, color: '#000', fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
          Klar
        </button>
      </div>
    );
  }

  const forvaltObjekt = forvalt ? objekt.find(o => o.objekt_id === forvalt) : null;

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: C.bg, color: C.t1, fontFamily: ff, overflowY: 'auto' }}>
      <div style={{ padding: '24px 20px 0', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 4 }}>Starta jobb</div>
        <div style={{ fontSize: 13, color: C.t3, marginBottom: 20 }}>Skapa objekt och få VO-nummer — knappa in det i båda maskinerna.</div>

        {/* Förvalt maskinobjekt (?objekt=<id> — matchningsvyns "Skapa") */}
        {forvaltObjekt && (
          <div style={{ background: C.card, border: '1px solid rgba(34,197,94,0.4)', borderRadius: 16, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.t3, marginBottom: 4 }}>Valt maskinobjekt</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 2, color: forvaltObjekt.object_name ? C.t1 : C.amber }}>{forvaltObjekt.object_name || 'Namnlöst objekt'}</div>
            <div style={{ fontSize: 12, color: C.t3, marginBottom: 12 }}>{[forvaltObjekt.skogsagare, forvaltObjekt.bolag].filter(Boolean).join(' · ') || 'Okänd ägare'}</div>
            <button onClick={() => tilldelaMaskinObjekt(forvaltObjekt)} disabled={saving} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: C.green, color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: ff, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Skapar …' : 'Skapa objekt & få VO'}
            </button>
          </div>
        )}

        {fel && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            {fel}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setFlik('nytt')} style={knappStil(flik === 'nytt')}>Nytt objekt</button>
          <button onClick={() => setFlik('maskin')} style={knappStil(flik === 'maskin')}>Maskinobjekt ({objekt.length})</button>
          <button onClick={() => setFlik('tilldelade')} style={knappStil(flik === 'tilldelade')}>Tilldelade ({tilldelade.length})</button>
        </div>

        {flik !== 'nytt' && (
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 16px', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 16, color: C.t3 }}>⌕</span>
            <input type="text" placeholder="Sök objekt, ägare..." value={sok} onChange={e => setSok(e.target.value)}
              style={{ flex: 1, border: 'none', background: 'none', fontSize: 16, color: C.t1, outline: 'none', fontFamily: ff }} />
            {sok && <button onClick={() => setSok('')} style={{ background: C.t3, border: 'none', color: C.bg, width: 20, height: 20, borderRadius: '50%', fontSize: 11, cursor: 'pointer' }}>✕</button>}
          </div>
        )}
      </div>

      <div style={{ padding: '0 20px 120px', maxWidth: 700, margin: '0 auto' }}>
        {error ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 15, color: C.red, marginBottom: 16 }}>{error}</div>
            <button onClick={() => window.location.reload()} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: C.green, color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>Försök igen</button>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.t3, fontSize: 15 }}>Laddar...</div>
        ) : flik === 'nytt' ? (
          /* ── Ingång 1: skapa objekt i förväg ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={nyNamn} onChange={e => setNyNamn(e.target.value)} placeholder="Objektnamn (t.ex. Husjönäs 3:1 RP -26)" style={faltStil} />
            <input value={nyMarkagare} onChange={e => setNyMarkagare(e.target.value)} placeholder="Markägare (valfritt)" style={faltStil} />
            <input value={nyBolag} onChange={e => setNyBolag(e.target.value)} placeholder="Bolag (valfritt)" style={faltStil} />
            <div style={{ display: 'flex', gap: 8 }}>
              {([['slutavverkning', 'Slutavverkning'], ['gallring', 'Gallring']] as const).map(([varde, label]) => (
                <button key={varde} onClick={() => setNyTyp(varde)} style={{
                  flex: 1, padding: 14, borderRadius: 12, fontFamily: ff, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (nyTyp === varde ? 'rgba(34,197,94,0.45)' : C.border),
                  background: nyTyp === varde ? 'rgba(34,197,94,0.12)' : 'transparent',
                  color: nyTyp === varde ? C.green : C.t3,
                }}>
                  {nyTyp === varde ? '● ' : '○ '}{label}
                </button>
              ))}
            </div>
            <button onClick={skapaNyttObjekt} disabled={saving} style={{
              marginTop: 6, padding: 16, borderRadius: 14, border: 'none',
              background: C.green, color: '#000', fontSize: 17, fontWeight: 600,
              cursor: 'pointer', fontFamily: ff, opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Skapar …' : 'Skapa objekt & få VO'}
            </button>
            <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.5, padding: '4px 2px' }}>
              Objektet hamnar i Objekt-vyn för planering. Knappa in VO-numret i båda
              maskinerna — maskindatan kopplas ihop automatiskt när filerna kommer in.
              Resten (inköpare, åtgärd, egenskaper) fylls i via Redigering.
            </div>
          </div>
        ) : flik === 'maskin' ? (
          /* ── Ingång 2: befintliga maskinobjekt utan VO ── */
          lista.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: .3 }}>✓</div>
              <div style={{ fontSize: 15 }}>Alla maskinobjekt har VO-nummer</div>
            </div>
          ) : (
            lista.map(obj => (
              <div key={obj.objekt_id} onClick={() => tilldelaMaskinObjekt(obj)}
                style={{ background: C.card, borderRadius: 16, padding: 18, cursor: saving ? 'wait' : 'pointer', marginBottom: 10, border: '1px solid ' + C.border, opacity: saving ? 0.5 : 1 }}>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 4, color: obj.object_name ? C.t1 : C.amber }}>
                  {obj.object_name || 'Namnlöst objekt'}
                </div>
                <div style={{ fontSize: 12, color: C.t3 }}>
                  {[obj.skogsagare, obj.bolag].filter(Boolean).join(' · ') || 'Okänd ägare'}
                </div>
              </div>
            ))
          )
        ) : (
          /* ── Tilldelade ── */
          tilldeladeLista.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: C.t3, fontSize: 15 }}>Inga tilldelade objekt ännu</div>
          ) : (
            tilldeladeLista.map(o => (
              <div key={o.nyckel} onClick={() => setVisaVo({ namn: o.namn, vo: o.vo })}
                style={{ background: C.card, borderRadius: 16, padding: 18, cursor: 'pointer', marginBottom: 10, border: '1px solid ' + C.border }}>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 2 }}>{o.namn}</div>
                <div style={{ fontSize: 12, color: C.t3, marginBottom: 8 }}>{[o.agare, o.bolag].filter(Boolean).join(' · ') || 'Okänd ägare'}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.green }}>{o.vo}</div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
