'use client';

import { useEffect, useState, useCallback, CSSProperties } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import EkonomiBottomNav from '../EkonomiBottomNav';

// PRISERNA ÄR UTBRUTNA till /ekonomi/prislista (steg 1 av 3). Kvar här:
// Fortnox-mappning (maskin ↔ kostnadsställe, omappade CC, omappade
// fakturarader, synkstatus) och datamappning (sortimentgrupper) — de får
// egna vyer i steg 2/3.

type Mappning = { id: string; maskin_id: string; kostnadsstalle_kod: string };
type FortnoxCc = { kod: string; namn?: string; aktiv?: boolean; har_trafik?: boolean };
type Maskinopt = { maskin_id: string; modell: string | null; visningsnamn?: string | null; maskin_typ?: string | null };
// Ett maskinnamn i hela appen: visningsnamn före modell.
const maskinNamn = (m: { visningsnamn?: string | null; modell: string | null; maskin_id: string }) => (m.visningsnamn && String(m.visningsnamn).trim()) || m.modell || m.maskin_id;
type OmappadFaktura = {
  id: number;
  document_number: number;
  invoice_date: string | null;
  description: string | null;
  total: number | null;
  matched_objekt_id: string | null;
  manual_objekt_id: string | null;
  valt_objekt_id: string;  // UI-state
};
type ObjektVal = { objekt_id: string; label: string };
type SortGruppRad = {
  sortiment_id: string;
  namn: string;
  grupp: string | null;  // null = exkluderad
  grupp_manuell: boolean;
  dirty?: boolean;
};
const SORT_GRUPPER = ['Timmer', 'Klentimmer', 'Kubb', 'Massa', 'Energi', 'Övrigt'] as const;

// Ett synk-segment: "verifikat 4 aug" dämpat, eller i bärnsten med ålder
// när senaste lyckade körningen är äldre än 3 dygn (död synk ska synas).
const SYNK_LARM_DYGN = 3;
function synkDel(label: string, iso: string | null) {
  if (!iso) return <span style={{ color: 'rgba(240,178,76,0.85)' }}>{label} aldrig</span>;
  const dygn = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const datum = new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  if (dygn > SYNK_LARM_DYGN) {
    return <span style={{ color: 'rgba(240,178,76,0.85)' }}>{label} {datum} — {dygn} dygn sedan</span>;
  }
  return <span>{label} {datum}</span>;
}

// ── Styles ── (modulnivå: statiska, inga state-beroenden)
const s: Record<string, CSSProperties> = {
  page: { background: '#111110', minHeight: '100vh', paddingTop: 16, paddingBottom: 130, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" },
  header: { padding: '16px 16px 0' },
  sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 28, padding: '0 4px' },
  sectionBlurb: { fontSize: 11, color: '#7a7a72', padding: '0 4px', marginBottom: 10, marginTop: -4 },
  card: { background: '#1a1a18', borderRadius: 14, padding: 16 },
  input: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', color: '#e8e8e4', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btnDark: { background: '#000', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  btnGhost: { background: 'rgba(255,255,255,0.03)', color: '#bfcab9', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', width: '100%', marginTop: 10 },
  btnRemove: { background: 'transparent', color: '#7a7a72', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 18, lineHeight: 1 },
  pill: { display: 'inline-block', fontSize: 10, color: '#7a7a72', padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 999, fontWeight: 600, letterSpacing: 0.3 },
  th: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#7a7a72', textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  tdCell: { padding: '6px 6px' },
  inputNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  saveRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12 },
  dateNote: { fontSize: 11, color: '#7a7a72' },
};

// Fortnox-synkstatus (fortnox_sync_state via /api/fortnox/sync-status).
// 'fel' = kunde inte läsas — visas, aldrig tyst (en död statusläsning är
// samma blindhet som larmet ska bota).
type SynkStatus = {
  last_success_at: string | null;
  invoice_last_sync_at: string | null;
  last_status: string | null;   // 'ok' | 'pågår' | 'fel' | 'avbruten' (härlett)
} | 'fel' | null;

export default function InstallningarClient() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [synk, setSynk] = useState<SynkStatus>(null);

  useEffect(() => {
    let avbruten = false;
    (async () => {
      try {
        const r = await fetch('/api/fortnox/sync-status', { cache: 'no-store' });
        const body = await r.json();
        if (avbruten) return;
        setSynk(r.ok && body.ok
          ? { last_success_at: body.last_success_at || null, invoice_last_sync_at: body.invoice_last_sync_at || null, last_status: body.last_status || null }
          : 'fel');
      } catch {
        if (!avbruten) setSynk('fel');
      }
    })();
    return () => { avbruten = true; };
  }, []);

  const [mappningar, setMappningar] = useState<Mappning[]>([]);
  const [maskinOptLista, setMaskinOptLista] = useState<Maskinopt[]>([]);
  const [fortnoxCc, setFortnoxCc] = useState<FortnoxCc[]>([]);
  const [omappadeCc, setOmappadeCc] = useState<FortnoxCc[]>([]);
  const [savingCcMap, setSavingCcMap] = useState(false);
  // Per-omappad: vald maskin i dropdown innan tryck på Spara
  const [omappadVal, setOmappadVal] = useState<Record<string, string>>({});
  const [omappade, setOmappade] = useState<OmappadFaktura[]>([]);
  const [objektVal, setObjektVal] = useState<ObjektVal[]>([]);
  const [savingMap, setSavingMap] = useState<number | null>(null);
  const [sortGruppRader, setSortGruppRader] = useState<SortGruppRad[]>([]);
  const [savingSortGrupp, setSavingSortGrupp] = useState<string | null>(null);
  const [sortGruppFilter, setSortGruppFilter] = useState<string>('Ej manuella');

  const flashMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [omappadRes, objektValRes, sortGruppRes] = await Promise.all([
      supabase.from('fortnox_invoice_rows')
        .select('id, document_number, invoice_date, description, total, matched_objekt_id, manual_objekt_id')
        .is('matched_objekt_id', null)
        .is('manual_objekt_id', null)
        .not('total', 'is', null)
        .order('invoice_date', { ascending: false })
        .limit(200),
      supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer').order('object_name').limit(1000),
      supabase.from('dim_sortiment').select('sortiment_id, namn, dim_sortiment_grupp(grupp, grupp_manuell)').order('namn'),
    ]);
    // Kostnadsställe-mappning (flera CC per maskin tillåtna) — hämtas via
    // dedikerat API som även returnerar omappade CC och Fortnox-listan.
    try {
      const mapResp = await fetch('/api/fortnox/mappning', { cache: 'no-store' });
      const mapBody = await mapResp.json();
      if (mapResp.ok && mapBody.ok) {
        setMappningar(mapBody.mappningar || []);
        setMaskinOptLista(mapBody.maskiner || []);
        setFortnoxCc(mapBody.fortnox_kostnadsstallen || []);
        setOmappadeCc(mapBody.omappade || []);
      }
    } catch { /* behåll tidigare state vid fel */ }

    setOmappade((omappadRes.data || []).map((r: any) => ({
      id: r.id,
      document_number: r.document_number,
      invoice_date: r.invoice_date,
      description: r.description,
      total: r.total,
      matched_objekt_id: r.matched_objekt_id,
      manual_objekt_id: r.manual_objekt_id,
      valt_objekt_id: '',
    })));

    setObjektVal((objektValRes.data || []).map((o: any) => ({
      objekt_id: o.objekt_id,
      label: o.object_name
        ? (o.vo_nummer ? `${o.object_name} (VO ${o.vo_nummer})` : o.object_name)
        : (o.vo_nummer ? `VO ${o.vo_nummer}` : o.objekt_id),
    })));

    setSortGruppRader((sortGruppRes.data || []).map((s: any) => {
      const g = Array.isArray(s.dim_sortiment_grupp) ? s.dim_sortiment_grupp[0] : s.dim_sortiment_grupp;
      return {
        sortiment_id: s.sortiment_id,
        namn: s.namn || '',
        grupp: g?.grupp ?? null,
        grupp_manuell: !!g?.grupp_manuell,
      };
    }));

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Manuell fakturarads-mappning ──
  const updateOmappad = (idx: number, objekt_id: string) => {
    setOmappade(prev => prev.map((r, i) => i === idx ? { ...r, valt_objekt_id: objekt_id } : r));
  };
  const saveOmappad = async (idx: number) => {
    const row = omappade[idx];
    if (!row.valt_objekt_id) { flashMsg('Välj objekt först'); return; }
    setSavingMap(row.id);
    const { error } = await supabase
      .from('fortnox_invoice_rows')
      .update({ manual_objekt_id: row.valt_objekt_id })
      .eq('id', row.id);
    setSavingMap(null);
    if (error) { flashMsg(`Fel: ${error.message}`); return; }
    // Ta bort raden lokalt (den är nu mappad)
    setOmappade(prev => prev.filter((_, i) => i !== idx));
    flashMsg(`Mappad: faktura ${row.document_number} → ${objektVal.find(o => o.objekt_id === row.valt_objekt_id)?.label || row.valt_objekt_id}`);
  };

  // ── Sortiment-grupp-mappning ──
  const updateSortGrupp = (idx: number, grupp: string | null) => {
    setSortGruppRader(prev => prev.map((r, i) => i === idx ? { ...r, grupp, dirty: true } : r));
  };
  const saveSortGrupp = async (idx: number) => {
    const row = sortGruppRader[idx];
    setSavingSortGrupp(row.sortiment_id);
    const { error } = await supabase.from('dim_sortiment_grupp')
      .upsert({
        sortiment_id: row.sortiment_id,
        grupp: row.grupp,
        grupp_manuell: true,
        uppdaterad_tid: new Date().toISOString(),
      }, { onConflict: 'sortiment_id' });
    setSavingSortGrupp(null);
    if (error) { flashMsg(`Fel: ${error.message}`); return; }
    setSortGruppRader(prev => prev.map((r, i) => i === idx
      ? { ...r, grupp_manuell: true, dirty: false }
      : r));
    flashMsg(`Sparad: ${row.namn || row.sortiment_id} → ${row.grupp || '(exkluderad)'}`);
  };

  // ── Kostnadsställe-mappning (flera CC per maskin) ──
  const läggTillMappning = async (maskin_id: string, kod: string) => {
    if (!maskin_id || !kod) return;
    setSavingCcMap(true);
    const r = await fetch('/api/fortnox/mappning', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maskin_id, kostnadsstalle_kod: kod }),
    });
    const body = await r.json();
    setSavingCcMap(false);
    if (!r.ok || !body.ok) { flashMsg(`Fel: ${body.error || r.status}`); return; }
    flashMsg(`Mappning tillagd: ${kod} → ${maskin_id}`);
    setOmappadVal(prev => { const n = { ...prev }; delete n[kod]; return n; });
    await fetchData();
  };
  const taBortMappning = async (id: string) => {
    setSavingCcMap(true);
    const r = await fetch(`/api/fortnox/mappning/${id}`, { method: 'DELETE' });
    const body = await r.json();
    setSavingCcMap(false);
    if (!r.ok || !body.ok) { flashMsg(`Fel: ${body.error || r.status}`); return; }
    flashMsg('Mappning avslutad — historiken bevaras');
    await fetchData();
  };

  return (
    <div style={s.page}>
      <style>{`
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
      `}</style>

      <div style={s.header}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Mappningar &amp; synk</div>
        <div style={s.dateNote as CSSProperties}>
          Fortnox-mappning och datamappning. Priserna är flyttade till <Link href="/ekonomi/prislista" style={{ textDecoration: 'underline', color: 'inherit' }}>Prislistan</Link>.
        </div>
        {/* Synk-status — en död Fortnox-synk ska synas HÄR, inte upptäckas
            efter månader. Äldre än 3 dygn → bärnsten. */}
        {synk && (
          <div style={{ fontSize: 11, marginTop: 6, color: '#7a7a72' }}>
            {synk === 'fel' ? (
              <>Fortnox-synk: status kunde inte läsas</>
            ) : (
              <>
                Fortnox senast synkad: {synkDel('verifikat', synk.last_success_at)} · {synkDel('fakturor', synk.invoice_last_sync_at)}
                {/* Krashad/avbruten körning ska synas, inte gömmas bakom ett gammalt ok-datum */}
                {synk.last_status && synk.last_status !== 'ok' && synk.last_status !== 'pågår' && (
                  <span style={{ color: 'rgba(240,178,76,0.85)' }}> · senaste körning: {synk.last_status}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'rgba(90,255,140,0.1)', border: '1px solid rgba(90,255,140,0.3)', color: 'rgba(90,255,140,0.95)', borderRadius: 10, fontSize: 12 }}>
          {msg}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && (
        <div style={{ padding: '0 16px' }}>

          {/* Kostnadsställe per maskin — stöder flera CC per maskin */}
          <div style={s.sectionTitle as CSSProperties}>Kostnadsställe per maskin (Fortnox)</div>
          <div style={s.sectionBlurb as CSSProperties}>Flera kostnadsställen kan kopplas till samma maskin — används när Fortnox har skilda CC för intäkter och kostnader (t.ex. Scorpion Gigant med både SCO och M13).</div>
          <div style={s.card}>
            {maskinOptLista.map((m, idx) => {
              const kopplade = mappningar.filter(x => x.maskin_id === m.maskin_id);
              return (
                <div key={m.maskin_id} style={{ padding: '12px 0', borderBottom: idx < maskinOptLista.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{maskinNamn(m)}</div>
                      <div style={{ fontSize: 10, color: '#7a7a72', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>{m.maskin_id}</div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                      {kopplade.length === 0 && (
                        <span style={{ fontSize: 11, color: '#7a7a72', fontStyle: 'italic' as const }}>inga kostnadsställen</span>
                      )}
                      {kopplade.map(k => {
                        const cc = fortnoxCc.find(c => c.kod === k.kostnadsstalle_kod);
                        return (
                          <span key={k.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 6px 4px 10px', background: 'rgba(173,198,255,0.08)', border: '1px solid rgba(173,198,255,0.2)', borderRadius: 999, color: '#adc6ff' }}
                            title={cc?.namn || ''}>
                            <span style={{ fontWeight: 600 }}>{k.kostnadsstalle_kod}</span>
                            {cc?.namn && <span style={{ color: '#7a7a72' }}>{cc.namn}</span>}
                            <button
                              onClick={() => taBortMappning(k.id)}
                              disabled={savingCcMap}
                              style={{ background: 'transparent', border: 'none', color: '#7a7a72', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}
                              aria-label="Ta bort mappning">×</button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {maskinOptLista.length === 0 && <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>Inga maskiner i dim_maskin.</div>}
          </div>

          {/* Omappade kostnadsställen från Fortnox */}
          <div style={s.sectionTitle as CSSProperties}>Omappade kostnadsställen</div>
          <div style={s.sectionBlurb as CSSProperties}>
            Kostnadsställen i Fortnox som inte är kopplade till någon maskin. Välj maskin och tryck Koppla — eller lämna som ”egna kostnadsobjekt” (t.ex. M8 Lastbil, TRA Trailer).
          </div>
          <div style={s.card}>
            {omappadeCc.length === 0 && <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>Alla kostnadsställen är mappade.</div>}
            {omappadeCc.map((cc, idx) => (
              <div key={cc.kod} style={{ padding: '12px 0', borderBottom: idx < omappadeCc.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr auto', gap: 8, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {cc.kod}
                      {cc.aktiv === false && <span style={{ marginLeft: 6, fontSize: 10, color: '#7a7a72' }}>(inaktiv)</span>}
                      {cc.har_trafik && <span style={{ marginLeft: 6, fontSize: 10, color: 'rgba(255,179,64,0.95)' }}>• data finns</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>{cc.namn || '—'}</div>
                  </div>
                  <select
                    style={{ ...s.input, fontSize: 12 } as CSSProperties}
                    value={omappadVal[cc.kod] || ''}
                    onChange={e => setOmappadVal(prev => ({ ...prev, [cc.kod]: e.target.value }))}>
                    <option value="">Välj maskin…</option>
                    {maskinOptLista.map(m => (
                      <option key={m.maskin_id} value={m.maskin_id}>{maskinNamn(m)}</option>
                    ))}
                  </select>
                  <button
                    style={{ ...s.btnDark, opacity: !omappadVal[cc.kod] || savingCcMap ? 0.4 : 1 } as CSSProperties}
                    disabled={!omappadVal[cc.kod] || savingCcMap}
                    onClick={() => läggTillMappning(omappadVal[cc.kod], cc.kod)}>
                    Koppla
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Omappade fakturarader */}
          <div style={s.sectionTitle as CSSProperties}>Omappade fakturarader</div>
          <div style={s.sectionBlurb as CSSProperties}>
            Rader där VO-regex inte hittade matchande objekt. Välj objekt manuellt — detta bevaras över framtida synkar.
          </div>
          <div style={s.card}>
            {omappade.length === 0 && (
              <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>
                Inga omappade rader. Kör <code style={{ fontFamily: 'inherit', color: '#bfcab9' }}>POST /api/fortnox/sync-invoices?full=1</code> för första synkningen.
              </div>
            )}
            {omappade.map((r, idx) => {
              const isSaving = savingMap === r.id;
              return (
                <div key={r.id} style={{ padding: '12px 0', borderBottom: idx < omappade.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>Faktura {r.document_number}</div>
                    <div style={{ fontSize: 10, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>
                      {r.invoice_date || '—'} · {r.total != null ? Math.round(r.total).toLocaleString('sv-SE') : '—'} kr
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#bfcab9', marginBottom: 8, fontStyle: 'italic' }}>
                    {r.description || '(ingen beskrivning)'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                    <select
                      value={r.valt_objekt_id}
                      onChange={e => updateOmappad(idx, e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8, padding: '8px 10px', color: '#e8e8e4', fontSize: 13,
                        fontFamily: 'inherit', outline: 'none', width: '100%',
                      }}>
                      <option value="">— Välj objekt —</option>
                      {objektVal.map(o => <option key={o.objekt_id} value={o.objekt_id}>{o.label}</option>)}
                    </select>
                    <button
                      style={{ ...s.btnDark, opacity: isSaving || !r.valt_objekt_id ? 0.6 : 1 } as CSSProperties}
                      disabled={isSaving || !r.valt_objekt_id}
                      onClick={() => saveOmappad(idx)}>
                      {isSaving ? 'Sparar...' : 'Mappa'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sortiment-grupp-mappning */}
          <div style={s.sectionTitle as CSSProperties}>Sortimentgrupp-mappning</div>
          <div style={s.sectionBlurb as CSSProperties}>
            Varje sortiment-id får en grupp som räknas i acord (Timmer/Klentimmer/Kubb/Massa/Energi/Övrigt).
            Välj "Exkluderat" för Avkap, test och fallback. Manuell ändring skyddas från framtida auto-seed.
          </div>
          <div style={{ ...s.card, padding: 14 } as CSSProperties}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {['Alla', 'Ej manuella', 'Exkluderade', 'Timmer', 'Klentimmer', 'Kubb', 'Massa', 'Energi', 'Övrigt'].map(f => (
                <button key={f}
                  style={{
                    ...s.periodBtn,
                    ...(sortGruppFilter === f ? s.periodBtnActive : {}),
                  } as CSSProperties}
                  onClick={() => setSortGruppFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
            {(() => {
              const filtered = sortGruppRader.filter(r => {
                if (sortGruppFilter === 'Alla') return true;
                if (sortGruppFilter === 'Ej manuella') return !r.grupp_manuell;
                if (sortGruppFilter === 'Exkluderade') return r.grupp == null;
                return r.grupp === sortGruppFilter;
              });
              if (filtered.length === 0) {
                return <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0', textAlign: 'center' }}>Inga rader i filtret.</div>;
              }
              return (
                <div>
                  <div style={{ fontSize: 10, color: '#7a7a72', marginBottom: 8 }}>Visar {filtered.length} av {sortGruppRader.length} sortiment.</div>
                  {filtered.map(r => {
                    const idx = sortGruppRader.findIndex(x => x.sortiment_id === r.sortiment_id);
                    const isSaving = savingSortGrupp === r.sortiment_id;
                    return (
                      <div key={r.sortiment_id} style={{
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8, alignItems: 'center',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.namn || <span style={{ color: '#7a7a72', fontStyle: 'italic' }}>(tom)</span>}
                          </div>
                          <div style={{ fontSize: 9, color: '#7a7a72', fontFamily: 'ui-monospace, monospace', marginTop: 1 }}>
                            {r.sortiment_id}
                            {r.grupp_manuell && <span style={{ marginLeft: 6, color: 'rgba(173,198,255,0.7)' }}>● manuell</span>}
                          </div>
                        </div>
                        <select
                          value={r.grupp ?? ''}
                          onChange={e => updateSortGrupp(idx, e.target.value || null)}
                          style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, padding: '6px 8px', color: '#e8e8e4', fontSize: 12,
                            fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                          }}>
                          <option value="">Exkluderat</option>
                          {SORT_GRUPPER.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <button
                          style={{ ...s.btnDark, padding: '6px 10px', fontSize: 11, opacity: isSaving || !r.dirty ? 0.4 : 1 } as CSSProperties}
                          disabled={isSaving || !r.dirty}
                          onClick={() => saveSortGrupp(idx)}>
                          {isSaving ? '…' : 'Spara'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>


        </div>
      )}
      <EkonomiBottomNav />
    </div>
  );
}
