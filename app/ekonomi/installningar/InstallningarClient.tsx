'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import EkonomiBottomNav from '../EkonomiBottomNav';

type MaskinRad = {
  id?: string;
  maskin_id: string;
  maskin_namn: string;
  timpris: number | '';
  giltig_fran: string | null;
  isNew?: boolean;
  dirty?: boolean;
};

type AcordRad = {
  id?: string;
  medelstam: number | '';
  pris_total: number | '';
  pris_skordare: number | '';
  pris_skotare: number | '';
  giltig_fran: string | null;
  isNew?: boolean;
  dirty?: boolean;
};

function todayIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function yesterdayIso() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('sv-SE');
}

export default function InstallningarClient() {
  const [loading, setLoading] = useState(true);
  const [maskiner, setMaskiner] = useState<MaskinRad[]>([]);
  const [acord, setAcord] = useState<AcordRad[]>([]);
  const [savingMaskin, setSavingMaskin] = useState<string | null>(null);
  const [savingAcord, setSavingAcord] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [mRes, aRes] = await Promise.all([
      supabase.from('maskin_timpris')
        .select('id, maskin_id, maskin_namn, timpris, giltig_fran, giltig_till')
        .is('giltig_till', null)
        .order('maskin_namn'),
      supabase.from('acord_priser')
        .select('id, medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till')
        .is('giltig_till', null)
        .order('medelstam'),
    ]);
    setMaskiner((mRes.data || []).map((m: any) => ({
      id: m.id, maskin_id: m.maskin_id, maskin_namn: m.maskin_namn || '',
      timpris: m.timpris, giltig_fran: m.giltig_fran,
    })));
    setAcord((aRes.data || []).map((a: any) => ({
      id: a.id, medelstam: a.medelstam, pris_total: a.pris_total,
      pris_skordare: a.pris_skordare, pris_skotare: a.pris_skotare, giltig_fran: a.giltig_fran,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const flashMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  };

  // ── Maskin handlers ──
  const updateMaskin = (idx: number, patch: Partial<MaskinRad>) => {
    setMaskiner(prev => prev.map((m, i) => i === idx ? { ...m, ...patch, dirty: true } : m));
  };

  const addMaskin = () => {
    setMaskiner(prev => [...prev, {
      maskin_id: '', maskin_namn: '', timpris: '',
      giltig_fran: null, isNew: true, dirty: true,
    }]);
  };

  const saveMaskin = async (idx: number) => {
    const row = maskiner[idx];
    if (!row.maskin_id.trim() || !row.maskin_namn.trim() || row.timpris === '' || Number(row.timpris) <= 0) {
      flashMsg('Fyll i maskin-ID, namn och ett pris > 0');
      return;
    }
    setSavingMaskin(row.maskin_id || `ny-${idx}`);

    const today = todayIso();
    const yest = yesterdayIso();

    if (!row.isNew && row.id) {
      await supabase.from('maskin_timpris')
        .update({ giltig_till: yest })
        .eq('maskin_id', row.maskin_id)
        .is('giltig_till', null);
    }

    const { error } = await supabase.from('maskin_timpris').insert({
      maskin_id: row.maskin_id.trim(),
      maskin_namn: row.maskin_namn.trim(),
      timpris: Number(row.timpris),
      giltig_fran: today,
      giltig_till: null,
    });

    setSavingMaskin(null);

    if (error) {
      flashMsg(`Fel: ${error.message}`);
      return;
    }
    flashMsg(`Sparat: ${row.maskin_namn}`);
    await fetchData();
  };

  // ── Acord handlers ──
  const updateAcord = (idx: number, patch: Partial<AcordRad>) => {
    setAcord(prev => prev.map((a, i) => i === idx ? { ...a, ...patch, dirty: true } : a));
  };

  const removeAcord = (idx: number) => {
    setAcord(prev => prev.filter((_, i) => i !== idx).map(r => ({ ...r, dirty: true })));
  };

  const addAcord = () => {
    setAcord(prev => [...prev, {
      medelstam: '', pris_total: '', pris_skordare: '', pris_skotare: '',
      giltig_fran: null, isNew: true, dirty: true,
    }]);
  };

  const saveAllAcord = async () => {
    for (const r of acord) {
      if (r.medelstam === '' || r.pris_total === '' || r.pris_skordare === '' || r.pris_skotare === '') {
        flashMsg('Alla acord-fält måste vara ifyllda');
        return;
      }
      if (Number(r.pris_total) <= 0 || Number(r.medelstam) <= 0) {
        flashMsg('Pris och medelstam måste vara > 0');
        return;
      }
    }
    setSavingAcord(true);
    const today = todayIso();
    const yest = yesterdayIso();

    // End all currently active acord rows
    const { error: endErr } = await supabase.from('acord_priser')
      .update({ giltig_till: yest })
      .is('giltig_till', null);

    if (endErr) {
      setSavingAcord(false);
      flashMsg(`Fel: ${endErr.message}`);
      return;
    }

    // Insert new set with today as start
    const { error: insErr } = await supabase.from('acord_priser').insert(
      acord.map(r => ({
        medelstam: Number(r.medelstam),
        pris_total: Number(r.pris_total),
        pris_skordare: Number(r.pris_skordare),
        pris_skotare: Number(r.pris_skotare),
        giltig_fran: today,
        giltig_till: null,
      }))
    );

    setSavingAcord(false);
    if (insErr) {
      flashMsg(`Fel: ${insErr.message}`);
      return;
    }
    flashMsg('Ny acord-prisuppsättning sparad');
    await fetchData();
  };

  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 16, paddingBottom: 130, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    header: { padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 12 } as const,
    back: { border: 'none', background: 'rgba(255,255,255,0.05)', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8e8e4', cursor: 'pointer', padding: 0 } as const,
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 28, padding: '0 4px' } as const,
    sectionBlurb: { fontSize: 11, color: '#7a7a72', padding: '0 4px', marginBottom: 10, marginTop: -4 } as const,
    card: { background: '#1a1a18', borderRadius: 14, padding: 16 } as const,
    row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' } as const,
    input: {
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, padding: '8px 10px', color: '#e8e8e4', fontSize: 13,
      fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' as const,
    },
    btnDark: {
      background: '#000', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600,
      fontFamily: 'inherit', cursor: 'pointer',
    } as const,
    btnGhost: {
      background: 'rgba(255,255,255,0.03)', color: '#bfcab9',
      border: '1px dashed rgba(255,255,255,0.15)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600,
      fontFamily: 'inherit', cursor: 'pointer', width: '100%', marginTop: 10,
    } as const,
    btnRemove: {
      background: 'transparent', color: '#7a7a72',
      border: 'none', cursor: 'pointer', padding: '4px 8px',
      fontSize: 18, lineHeight: 1,
    } as const,
    pill: {
      display: 'inline-block', fontSize: 10, color: '#7a7a72', padding: '2px 8px',
      background: 'rgba(255,255,255,0.04)', borderRadius: 999, fontWeight: 600,
      letterSpacing: 0.3,
    } as const,
    th: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.6, color: '#7a7a72', textAlign: 'left' as const, padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)' } as const,
  };

  return (
    <div style={s.page}>
      <style>{`
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>
      <div style={s.header}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Prisinställningar</div>
          <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>Ändringar skapar nya rader med dagens datum. Gamla priser bevaras.</div>
        </div>
      </div>

      {msg && (
        <div style={{
          margin: '12px 16px 0', padding: '10px 14px',
          background: 'rgba(90,255,140,0.1)', border: '1px solid rgba(90,255,140,0.3)',
          color: 'rgba(90,255,140,0.95)', borderRadius: 10, fontSize: 12,
        }}>{msg}</div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && (
        <div style={{ padding: '0 16px' }}>

          {/* ── Section 1: Maskinpriser ── */}
          <div style={s.sectionTitle}>Maskinpriser (timpeng)</div>
          <div style={s.sectionBlurb}>Per maskin. Spara skriver en ny rad med dagens datum och avslutar den gamla.</div>
          <div style={s.card}>
            {maskiner.map((m, idx) => {
              const isSaving = savingMaskin === (m.maskin_id || `ny-${idx}`);
              return (
                <div key={m.id || `ny-${idx}`} style={{
                  padding: '12px 0', borderBottom: idx < maskiner.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 1fr auto', gap: 8, alignItems: 'center' }}>
                    <input
                      style={s.input}
                      value={m.maskin_id}
                      onChange={e => updateMaskin(idx, { maskin_id: e.target.value })}
                      placeholder="Maskin-ID"
                      disabled={!m.isNew}
                    />
                    <input
                      style={s.input}
                      value={m.maskin_namn}
                      onChange={e => updateMaskin(idx, { maskin_namn: e.target.value })}
                      placeholder="Namn"
                    />
                    <input
                      style={{ ...s.input, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      type="number"
                      inputMode="numeric"
                      value={m.timpris}
                      onChange={e => updateMaskin(idx, { timpris: e.target.value === '' ? '' : Number(e.target.value) })}
                      placeholder="Kr/tim"
                    />
                    <button
                      style={{ ...s.btnDark, opacity: isSaving ? 0.6 : 1 }}
                      disabled={isSaving}
                      onClick={() => saveMaskin(idx)}>
                      {isSaving ? 'Sparar...' : 'Spara'}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={s.pill}>Gäller från {formatDate(m.giltig_fran)}</span>
                    {m.isNew && <span style={{ ...s.pill, color: 'rgba(90,255,140,0.9)', background: 'rgba(90,255,140,0.08)' }}>Ny</span>}
                    {m.dirty && !m.isNew && <span style={{ ...s.pill, color: 'rgba(255,179,64,0.9)', background: 'rgba(255,179,64,0.08)' }}>Ändrad — ej sparad</span>}
                  </div>
                </div>
              );
            })}
            {maskiner.length === 0 && <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>Inga aktiva maskinpriser.</div>}
          </div>
          <button style={s.btnGhost} onClick={addMaskin}>+ Lägg till maskin</button>

          {/* ── Section 2: Acordpriser ── */}
          <div style={s.sectionTitle}>Acordpriser (slutavverkning)</div>
          <div style={s.sectionBlurb}>Prisbrackets per medelstam. Spara skapar en ny, komplett prisuppsättning med dagens datum.</div>
          <div style={{ ...s.card, padding: '4px 14px 14px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={s.th}>Medelstam</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Skördare</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Skotare</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {acord.map((a, idx) => (
                  <tr key={a.id || `ny-${idx}`}>
                    <td style={{ padding: '6px 6px' }}>
                      <input
                        style={{ ...s.input, fontVariantNumeric: 'tabular-nums' }}
                        type="number" step="0.01" inputMode="decimal"
                        value={a.medelstam}
                        onChange={e => updateAcord(idx, { medelstam: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ padding: '6px 6px' }}>
                      <input
                        style={{ ...s.input, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        type="number" inputMode="numeric"
                        value={a.pris_total}
                        onChange={e => updateAcord(idx, { pris_total: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ padding: '6px 6px' }}>
                      <input
                        style={{ ...s.input, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        type="number" inputMode="numeric"
                        value={a.pris_skordare}
                        onChange={e => updateAcord(idx, { pris_skordare: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ padding: '6px 6px' }}>
                      <input
                        style={{ ...s.input, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        type="number" inputMode="numeric"
                        value={a.pris_skotare}
                        onChange={e => updateAcord(idx, { pris_skotare: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>
                      <button style={s.btnRemove} onClick={() => removeAcord(idx)} aria-label="Ta bort rad">×</button>
                    </td>
                  </tr>
                ))}
                {acord.length === 0 && (
                  <tr><td colSpan={5} style={{ color: '#7a7a72', fontSize: 12, padding: '12px 6px', textAlign: 'center' }}>Ingen aktiv acord-prisuppsättning.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <button style={s.btnGhost} onClick={addAcord}>+ Lägg till medelstam-rad</button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 12 }}>
            <div style={{ fontSize: 11, color: '#7a7a72' }}>
              {acord.length > 0 && acord[0].giltig_fran
                ? `Nuvarande uppsättning gäller från ${formatDate(acord[0].giltig_fran)}`
                : 'Ingen aktiv uppsättning'}
            </div>
            <button
              style={{ ...s.btnDark, opacity: savingAcord ? 0.6 : 1 }}
              disabled={savingAcord}
              onClick={saveAllAcord}>
              {savingAcord ? 'Sparar...' : 'Spara alla (ny uppsättning)'}
            </button>
          </div>

          {/* ── Section 3: Info om giltighetsdatum ── */}
          <div style={s.sectionTitle}>Giltighetsdatum</div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: '#bfcab9', lineHeight: 1.55 }}>
              Varje prisändring sparas som en <strong>ny rad</strong> med <code style={{ fontFamily: 'inherit', color: '#e8e8e4' }}>giltig_fran = {todayIso()}</code>.
              Den gamla raden får <code style={{ fontFamily: 'inherit', color: '#e8e8e4' }}>giltig_till = {yesterdayIso()}</code> så att historiken bevaras.
              Ekonomi-vyn slår upp rätt pris per produktionsdag, så äldre data räknas med de priser som gällde då.
            </div>
          </div>

        </div>
      )}
      <EkonomiBottomNav />
    </div>
  );
}
