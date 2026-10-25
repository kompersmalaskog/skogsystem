'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { EkonomiSida, Laddar, MAXBREDD_BRED } from '../delade/mall';
import { SvarHuvud } from '../delade/svar';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import { synkSvar, type SynkStatus } from '@/lib/ekonomi/synkSvar';

// PRISERNA ÄR UTBRUTNA till /ekonomi/prislista (steg 1 av 3). Kvar här:
// Fortnox-mappning (maskin ↔ kostnadsställe, omappade CC, omappade
// fakturarader, synkstatus) och datamappning (sortimentgrupper).
//
// Barnregeln (2026-10-25): första skärmen svarar på EN fråga — "Hämtas
// siffrorna från Fortnox?" — och visar det som behöver kopplas som rader.
// Ett tryck öppnar ETT ämne (?del=), som Inställningar i iOS.

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


type Del = 'ccUtan' | 'fakturor' | 'cc' | 'sort';
const DEL: Record<Del, { titel: string; forklaring: string }> = {
  ccUtan: { titel: 'Kostnadsställen utan maskin', forklaring: 'Kostnadsställen i Fortnox som ingen maskin har. Koppla dem till en maskin — eller låt dem vara om de är egna, som lastbil och trailer.' },
  fakturor: { titel: 'Fakturor utan skog', forklaring: 'Fakturor där appen inte hittade vilken skog de hör till. Välj skog — valet står kvar när Fortnox hämtas igen.' },
  cc: { titel: 'Kostnadsställen per maskin', forklaring: 'En maskin kan ha flera kostnadsställen i Fortnox, till exempel ett för intäkter och ett för kostnader.' },
  sort: { titel: 'Virkets sorter', forklaring: 'Varje sortiment hör till en grupp som ackordet räknar med. Välj Räknas inte för avkap och test. Det du väljer skrivs inte över av appen.' },
};
const arDel = (v: string | null): Del | null => (v && v in DEL ? (v as Del) : null);
const SORT_FILTER = [
  { id: 'Ej manuella', text: 'Valda av appen' }, { id: 'Alla', text: 'Alla' }, { id: 'Exkluderade', text: 'Räknas inte' },
  ...SORT_GRUPPER.map(g => ({ id: g, text: g })),
];
const VAL = {
  background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, padding: `0 ${AVSTAND.m}px`, minHeight: TRAFFYTA.min,
  color: FARG.text, ...TYP.text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
};

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
  // Ett läsfel är ett fel — aldrig "alla är kopplade".
  const [lasFel, setLasFel] = useState<{ cc: boolean; fakturor: boolean; sort: boolean }>({ cc: false, fakturor: false, sort: false });

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
    let ccFel = true;
    try {
      const mapResp = await fetch('/api/fortnox/mappning', { cache: 'no-store' });
      const mapBody = await mapResp.json();
      if (mapResp.ok && mapBody.ok) {
        ccFel = false;
        setMappningar(mapBody.mappningar || []);
        setMaskinOptLista(mapBody.maskiner || []);
        setFortnoxCc(mapBody.fortnox_kostnadsstallen || []);
        setOmappadeCc(mapBody.omappade || []);
      }
    } catch { /* ccFel står kvar */ }
    setLasFel({ cc: ccFel, fakturor: !!omappadRes.error, sort: !!sortGruppRes.error });

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

  const [del, setDel] = useState<Del | null>(() => (typeof window === 'undefined' ? null : arDel(new URLSearchParams(window.location.search).get('del'))));
  useEffect(() => {
    const p = () => setDel(arDel(new URLSearchParams(window.location.search).get('del')));
    window.addEventListener('popstate', p);
    return () => window.removeEventListener('popstate', p);
  }, []);
  const valjDel = (d: Del | null) => {
    const u = new URL(window.location.href);
    if (d) u.searchParams.set('del', d); else u.searchParams.delete('del');
    if (d) window.history.pushState(null, '', u); else window.history.replaceState(null, '', u);
    setDel(d);
    window.scrollTo(0, 0);
  };

  const svar = synkSvar(synk, new Date());
  const antal: Record<Del, number> = {
    ccUtan: omappadeCc.length, fakturor: omappade.length, cc: maskinOptLista.length, sort: sortGruppRader.length,
  };
  const ejManuella = sortGruppRader.filter(r => !r.grupp_manuell).length;
  const felPa: Record<Del, boolean> = { ccUtan: lasFel.cc, cc: lasFel.cc, fakturor: lasFel.fakturor, sort: lasFel.sort };
  const underText: Record<Del, string> = {
    ccUtan: lasFel.cc ? 'Kunde inte läsas' : omappadeCc.length ? `${omappadeCc.length} att koppla` : 'Alla har en maskin',
    fakturor: lasFel.fakturor ? 'Kunde inte läsas' : omappade.length ? `${omappade.length} att koppla` : 'Alla har en skog',
    cc: lasFel.cc ? 'Kunde inte läsas' : `${antal.cc} ${antal.cc === 1 ? 'maskin' : 'maskiner'}`,
    sort: lasFel.sort ? 'Kunde inte läsas' : `${antal.sort} sortiment${ejManuella ? ` · ${ejManuella} valda av appen` : ''}`,
  };
  const msgFel = msg.startsWith('Fel');

  return (
    <EkonomiSida maxBredd={MAXBREDD_BRED}>
      <div style={{ padding: `0 ${AVSTAND.sidmarginal}px` }}>
        {msg && (
          <p role="status" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: msgFel ? FARG.rod : FARG.gron }}>{msg}</p>
        )}

        {loading && <Laddar />}

        {!loading && !del && (
          <>
            <SvarHuvud fraga="Hämtas siffrorna från Fortnox?" svar={svar.svar} under={svar.under} vantar={svar.vantar} />
            <Sektion rubrik="Att koppla">
              {(['ccUtan', 'fakturor'] as Del[]).map((k, i) => (
                <Rad key={k} titel={DEL[k].titel} under={underText[k]} onTryck={() => valjDel(k)} pil sista={i === 1} attr={{ 'data-del': k }}
                  hoger={!felPa[k] && antal[k] > 0 ? <span style={{ ...TYP.meta, ...TNUM, color: FARG.orange }}>{antal[k]}</span> : undefined} />
              ))}
            </Sektion>
            <Sektion rubrik="Inställningar">
              {(['cc', 'sort'] as Del[]).map((k, i) => (
                <Rad key={k} titel={DEL[k].titel} under={underText[k]} onTryck={() => valjDel(k)} pil sista={i === 1} attr={{ 'data-del': k }} />
              ))}
            </Sektion>
          </>
        )}

        {!loading && del && (
          <div style={{ marginTop: AVSTAND.l }}>
            <button type="button" onClick={() => valjDel(null)} style={{ ...KNAPP.tertiar, padding: 0, minHeight: TRAFFYTA.min }}>‹ Inställningar</button>
            <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel, color: FARG.text }}>{DEL[del].titel}</h1>
            <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>{DEL[del].forklaring}</p>
            {felPa[del] && (
              <p role="alert" style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.rod }}>
                Kunde inte läsa det här just nu. <button type="button" onClick={fetchData} style={{ ...KNAPP.tertiar, padding: 0, minHeight: TRAFFYTA.min }}>Försök igen</button>
              </p>
            )}

            {del === 'cc' && (
              <Sektion rubrik="Maskiner">
                {!felPa.cc && maskinOptLista.length === 0 && <Rad titel="Inga maskiner i maskinregistret" sista dampad />}
                {maskinOptLista.map((m, idx) => {
                  const kopplade = mappningar.filter(x => x.maskin_id === m.maskin_id);
                  return (
                    <div key={m.maskin_id} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: idx < maskinOptLista.length - 1 ? `1px solid ${FARG.linje}` : 'none' }}>
                      <div style={{ ...TYP.listtitel, color: FARG.text }}>{maskinNamn(m)}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s, marginTop: AVSTAND.s }}>
                        {kopplade.length === 0 && <span style={{ ...TYP.meta, color: FARG.text2 }}>Inget kostnadsställe</span>}
                        {kopplade.map(k => {
                          const cc = fortnoxCc.find(c => c.kod === k.kostnadsstalle_kod);
                          return (
                            <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, padding: `0 0 0 ${AVSTAND.m}px`, background: FARG.fyllning, borderRadius: RADIE.rad, ...TYP.meta, color: FARG.text }}>
                              <span style={{ fontWeight: VIKT.halvfet }}>{k.kostnadsstalle_kod}</span>
                              {cc?.namn && <span style={{ color: FARG.text2 }}>{cc.namn}</span>}
                              <button type="button" onClick={() => taBortMappning(k.id)} disabled={savingCcMap} aria-label={`Ta bort ${k.kostnadsstalle_kod}`}
                                style={{ background: 'none', border: 'none', color: FARG.text2, cursor: 'pointer', minWidth: TRAFFYTA.min, minHeight: TRAFFYTA.min, ...TYP.text }}>×</button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </Sektion>
            )}

            {del === 'ccUtan' && (
              <Sektion rubrik="Kostnadsställen">
                {!felPa.ccUtan && omappadeCc.length === 0 && <Rad titel="Alla kostnadsställen har en maskin" sista dampad />}
                {omappadeCc.map((cc, idx) => (
                  <div key={cc.kod} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: idx < omappadeCc.length - 1 ? `1px solid ${FARG.linje}` : 'none' }}>
                    <div style={{ ...TYP.listtitel, color: FARG.text }}>{cc.kod}{cc.namn ? ` · ${cc.namn}` : ''}</div>
                    <div style={{ ...TYP.meta, color: cc.har_trafik ? FARG.orange : FARG.text2 }}>
                      {cc.har_trafik ? 'Har siffror i Fortnox' : 'Inga siffror än'}{cc.aktiv === false ? ' · inaktivt i Fortnox' : ''}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: AVSTAND.s, marginTop: AVSTAND.s }}>
                      <select style={VAL} value={omappadVal[cc.kod] || ''} aria-label={`Maskin för ${cc.kod}`}
                        onChange={e => setOmappadVal(prev => ({ ...prev, [cc.kod]: e.target.value }))}>
                        <option value="">Välj maskin…</option>
                        {maskinOptLista.map(m => <option key={m.maskin_id} value={m.maskin_id}>{maskinNamn(m)}</option>)}
                      </select>
                      <button type="button" style={{ ...KNAPP.sekundar, opacity: !omappadVal[cc.kod] || savingCcMap ? 0.4 : 1 }}
                        disabled={!omappadVal[cc.kod] || savingCcMap} onClick={() => läggTillMappning(omappadVal[cc.kod], cc.kod)}>Koppla</button>
                    </div>
                  </div>
                ))}
              </Sektion>
            )}

            {del === 'fakturor' && (
              <Sektion rubrik="Fakturor">
                {!felPa.fakturor && omappade.length === 0 && <Rad titel="Alla fakturor har en skog" sista dampad />}
                {omappade.map((r, idx) => {
                  const isSaving = savingMap === r.id;
                  return (
                    <div key={r.id} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: idx < omappade.length - 1 ? `1px solid ${FARG.linje}` : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s }}>
                        <span style={{ ...TYP.listtitel, color: FARG.text }}>Faktura {r.document_number}</span>
                        <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{r.total != null ? `${Math.round(r.total).toLocaleString('sv-SE')} kr` : ''}</span>
                      </div>
                      <div style={{ ...TYP.meta, color: FARG.text2 }}>{[r.invoice_date, r.description].filter(Boolean).join(' · ') || 'Ingen text på fakturan'}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: AVSTAND.s, marginTop: AVSTAND.s }}>
                        <select style={VAL} value={r.valt_objekt_id} aria-label={`Skog för faktura ${r.document_number}`} onChange={e => updateOmappad(idx, e.target.value)}>
                          <option value="">Välj skog…</option>
                          {objektVal.map(o => <option key={o.objekt_id} value={o.objekt_id}>{o.label}</option>)}
                        </select>
                        <button type="button" style={{ ...KNAPP.sekundar, opacity: isSaving || !r.valt_objekt_id ? 0.4 : 1 }}
                          disabled={isSaving || !r.valt_objekt_id} onClick={() => saveOmappad(idx)}>{isSaving ? 'Sparar…' : 'Koppla'}</button>
                      </div>
                    </div>
                  );
                })}
              </Sektion>
            )}

            {del === 'sort' && (
              <>
                <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap', marginBottom: AVSTAND.m }}>
                  {SORT_FILTER.map(f => (
                    <button key={f.id} type="button" aria-pressed={sortGruppFilter === f.id} onClick={() => setSortGruppFilter(f.id)}
                      style={{ ...TYP.meta, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.rad, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: sortGruppFilter === f.id ? FARG.text : FARG.fyllning, color: sortGruppFilter === f.id ? FARG.bg : FARG.text }}>
                      {f.text}
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
                  return (
                    <Sektion rubrik="Sortiment" not={`Visar ${filtered.length} av ${sortGruppRader.length} sortiment.`}>
                      {!felPa.sort && filtered.length === 0 && <Rad titel="Inga sortiment här" sista dampad />}
                      {filtered.map((r, i) => {
                        const idx = sortGruppRader.findIndex(x => x.sortiment_id === r.sortiment_id);
                        const isSaving = savingSortGrupp === r.sortiment_id;
                        return (
                          <div key={r.sortiment_id} style={{ padding: `${AVSTAND.s}px 0`, borderBottom: i < filtered.length - 1 ? `1px solid ${FARG.linje}` : 'none',
                            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 9em) auto', gap: AVSTAND.s, alignItems: 'center' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ ...TYP.text, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.namn || 'Utan namn'}</div>
                              <div style={{ ...TYP.meta, color: FARG.text2 }}>{r.grupp_manuell ? 'Vald av dig' : 'Vald av appen'}</div>
                            </div>
                            <select style={VAL} value={r.grupp ?? ''} aria-label={`Grupp för ${r.namn || r.sortiment_id}`} onChange={e => updateSortGrupp(idx, e.target.value || null)}>
                              <option value="">Räknas inte</option>
                              {SORT_GRUPPER.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <button type="button" style={{ ...KNAPP.sekundar, opacity: isSaving || !r.dirty ? 0.4 : 1 }}
                              disabled={isSaving || !r.dirty} onClick={() => saveSortGrupp(idx)}>{isSaving ? '…' : 'Spara'}</button>
                          </div>
                        );
                      })}
                    </Sektion>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
    </EkonomiSida>
  );
}
