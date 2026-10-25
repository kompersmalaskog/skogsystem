'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { EkonomiSida, Laddar, MAXBREDD_BRED } from '../delade/mall';
import { SvarHuvud } from '../delade/svar';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
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
  // Vilken sak som är öppen i ett ark, och sökordet i skog-arket.
  const [valt, setValt] = useState<{ typ: 'cc' | 'ccUtan' | 'faktura' | 'sort'; id: string } | null>(null);
  const [sok, setSok] = useState('');
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
  // Ett tryck på en skog i arket kopplar fakturan (inget extra Spara-steg).
  const saveOmappad = async (idx: number, objekt_id: string) => {
    const row = { ...omappade[idx], valt_objekt_id: objekt_id };
    if (!row.valt_objekt_id) { flashMsg('Välj skog först'); return; }
    setSavingMap(row.id);
    const { error } = await supabase
      .from('fortnox_invoice_rows')
      .update({ manual_objekt_id: row.valt_objekt_id })
      .eq('id', row.id);
    setSavingMap(null);
    if (error) { flashMsg(`Fel: ${error.message}`); return; }
    // Ta bort raden lokalt (den är nu mappad)
    setOmappade(prev => prev.filter((_, i) => i !== idx));
    flashMsg(`Faktura ${row.document_number} hör nu till ${objektVal.find(o => o.objekt_id === row.valt_objekt_id)?.label || row.valt_objekt_id}`);
  };

  // ── Sortiment-grupp-mappning ──
  // Ett tryck på en grupp i arket sparar den.
  const saveSortGrupp = async (idx: number, grupp: string | null) => {
    const row = { ...sortGruppRader[idx], grupp };
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
      ? { ...r, grupp, grupp_manuell: true, dirty: false }
      : r));
    flashMsg(row.grupp ? `${row.namn || row.sortiment_id} räknas som ${row.grupp}` : `${row.namn || row.sortiment_id} räknas inte`);
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
    const m = maskinOptLista.find(x => x.maskin_id === maskin_id);
    flashMsg(`${kod} kopplad till ${m ? maskinNamn(m) : maskin_id}`);
    await fetchData();
  };
  const taBortMappning = async (id: string) => {
    setSavingCcMap(true);
    const r = await fetch(`/api/fortnox/mappning/${id}`, { method: 'DELETE' });
    const body = await r.json();
    setSavingCcMap(false);
    if (!r.ok || !body.ok) { flashMsg(`Fel: ${body.error || r.status}`); return; }
    flashMsg('Kopplingen är borttagen. Det som redan bokförts står kvar.');
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

            {/* Barnregeln: en rad per sak, ett tryck öppnar ETT ark med frågan
                ("Vilken maskin?"), och ett tryck på svaret sparar. Inga
                rullgardiner och ingen Spara-knapp per rad. */}
            {del === 'cc' && (
              <Sektion rubrik="Maskiner" not="Nya kopplingar görs under Kostnadsställen utan maskin.">
                {!felPa.cc && maskinOptLista.length === 0 && <Rad titel="Inga maskiner i maskinregistret" sista dampad />}
                {maskinOptLista.map((m, idx) => {
                  const kopplade = mappningar.filter(x => x.maskin_id === m.maskin_id);
                  return (
                    <Rad key={m.maskin_id} attr={{ 'data-val-rad': m.maskin_id }} titel={maskinNamn(m)}
                      under={kopplade.length ? kopplade.map(k => k.kostnadsstalle_kod).join(', ') : 'Inget kostnadsställe'}
                      hoger={kopplade.length ? `${kopplade.length} st` : undefined}
                      sista={idx === maskinOptLista.length - 1}
                      onTryck={kopplade.length ? () => setValt({ typ: 'cc', id: m.maskin_id }) : undefined} />
                  );
                })}
              </Sektion>
            )}

            {del === 'ccUtan' && (
              <Sektion rubrik="Kostnadsställen">
                {!felPa.ccUtan && omappadeCc.length === 0 && <Rad titel="Alla kostnadsställen har en maskin" sista dampad />}
                {omappadeCc.map((cc, idx) => (
                  <Rad key={cc.kod} attr={{ 'data-val-rad': cc.kod }} titel={`${cc.kod}${cc.namn ? ` · ${cc.namn}` : ''}`}
                    under={<span style={{ color: cc.har_trafik ? FARG.orange : FARG.text2 }}>{cc.har_trafik ? 'Har siffror i Fortnox' : 'Inga siffror än'}{cc.aktiv === false ? ' · inaktivt i Fortnox' : ''}</span>}
                    hoger="Välj maskin" sista={idx === omappadeCc.length - 1}
                    onTryck={savingCcMap ? undefined : () => setValt({ typ: 'ccUtan', id: cc.kod })} />
                ))}
              </Sektion>
            )}

            {del === 'fakturor' && (
              <Sektion rubrik="Fakturor">
                {!felPa.fakturor && omappade.length === 0 && <Rad titel="Alla fakturor har en skog" sista dampad />}
                {omappade.map((r, idx) => (
                  <Rad key={r.id} attr={{ 'data-val-rad': String(r.id) }} titel={`Faktura ${r.document_number}`}
                    under={[r.invoice_date, r.description].filter(Boolean).join(' · ') || 'Ingen text på fakturan'}
                    hoger={r.total != null ? `${Math.round(r.total).toLocaleString('sv-SE')} kr` : undefined}
                    sista={idx === omappade.length - 1}
                    onTryck={savingMap != null ? undefined : () => { setSok(''); setValt({ typ: 'faktura', id: String(r.id) }); }} />
                ))}
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
                      {filtered.map((r, i) => (
                        <Rad key={r.sortiment_id} attr={{ 'data-val-rad': r.sortiment_id }} titel={r.namn || 'Utan namn'}
                          under={r.grupp_manuell ? 'Vald av dig' : 'Vald av appen'}
                          hoger={r.grupp ?? 'Räknas inte'} sista={i === filtered.length - 1}
                          onTryck={savingSortGrupp ? undefined : () => setValt({ typ: 'sort', id: r.sortiment_id })} />
                      ))}
                    </Sektion>
                  );
                })()}
              </>
            )}

            {valt?.typ === 'ccUtan' && (() => {
              const cc = omappadeCc.find(c => c.kod === valt.id);
              if (!cc) return null;
              return (
                <Ark rubrik={`Vilken maskin är ${cc.kod}?`} onStang={() => setValt(null)}>
                  {cc.namn && <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>I Fortnox heter det {cc.namn}.</p>}
                  <Sektion rubrik="Maskiner">
                    {maskinOptLista.map((m, i) => (
                      <Rad key={m.maskin_id} titel={maskinNamn(m)} sista={i === maskinOptLista.length - 1}
                        onTryck={savingCcMap ? undefined : () => { setValt(null); läggTillMappning(m.maskin_id, cc.kod); }} />
                    ))}
                  </Sektion>
                </Ark>
              );
            })()}

            {valt?.typ === 'cc' && (() => {
              const m = maskinOptLista.find(x => x.maskin_id === valt.id);
              if (!m) return null;
              const kopplade = mappningar.filter(x => x.maskin_id === m.maskin_id);
              return (
                <Ark rubrik={maskinNamn(m)} onStang={() => setValt(null)} stang="Klar">
                  <Sektion rubrik="Kostnadsställen" not="Tar du bort en koppling står det som redan bokförts kvar.">
                    {kopplade.length === 0 && <Rad titel="Inget kostnadsställe" sista dampad />}
                    {kopplade.map((k, i) => (
                      <Rad key={k.id} titel={k.kostnadsstalle_kod} under={fortnoxCc.find(c => c.kod === k.kostnadsstalle_kod)?.namn || undefined}
                        sista={i === kopplade.length - 1}
                        hoger={<button type="button" disabled={savingCcMap} onClick={() => taBortMappning(k.id)} style={KNAPP.destruktiv}>Ta bort</button>} />
                    ))}
                  </Sektion>
                </Ark>
              );
            })()}

            {valt?.typ === 'faktura' && (() => {
              const idx = omappade.findIndex(r => String(r.id) === valt.id);
              if (idx < 0) return null;
              const r = omappade[idx];
              const ord = sok.trim().toLowerCase().split(/\s+/).filter(Boolean);
              const traffar = objektVal.filter(o => ord.every(w => o.label.toLowerCase().includes(w)));
              return (
                <Ark rubrik="Vilken skog?" onStang={() => setValt(null)}>
                  <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>
                    Faktura {r.document_number}{r.description ? ` · ${r.description}` : ''}
                  </p>
                  <Falt etikett="Sök skog" value={sok} onChange={setSok} placeholder="namn eller VO-nummer" autoFocus />
                  <Sektion rubrik={ord.length ? `${traffar.length} träffar` : 'Alla skogar'}>
                    {traffar.length === 0 && <Rad titel="Ingen skog heter så" sista dampad />}
                    {traffar.slice(0, 50).map((o, i, l) => (
                      <Rad key={o.objekt_id} titel={o.label} sista={i === l.length - 1}
                        onTryck={() => { setValt(null); saveOmappad(idx, o.objekt_id); }} />
                    ))}
                  </Sektion>
                  {traffar.length > 50 && <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Visar 50 av {traffar.length}. Skriv mer för att hitta rätt.</p>}
                </Ark>
              );
            })()}

            {valt?.typ === 'sort' && (() => {
              const idx = sortGruppRader.findIndex(r => r.sortiment_id === valt.id);
              if (idx < 0) return null;
              const r = sortGruppRader[idx];
              const val: (string | null)[] = [...SORT_GRUPPER, null];
              return (
                <Ark rubrik={r.namn || 'Utan namn'} onStang={() => setValt(null)}>
                  <Sektion rubrik="Vilken sort är det?" not="Det du väljer skrivs inte över av appen.">
                    {val.map((g, i) => (
                      <Rad key={g ?? 'ingen'} titel={g ?? 'Räknas inte'} sista={i === val.length - 1}
                        hoger={r.grupp === g ? '✓' : undefined}
                        onTryck={() => { setValt(null); saveSortGrupp(idx, g); }} />
                    ))}
                  </Sektion>
                </Ark>
              );
            })()}
          </div>
        )}
      </div>
    </EkonomiSida>
  );
}
