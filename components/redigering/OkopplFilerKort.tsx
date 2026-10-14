'use client';

// FILER UTAN OBJEKT — HPR-filer vars ordernummer varken är något objekts vo_nummer eller ett extra nummer
// (tabellen objekt_alt_nummer). Planeringsvyn kan inte visa dem under något objekt, så skotaren får inga produktionshögar.
// Importen kopplar via exakt namnträff och sparar numret som extra nummer (objekt_koppling.py); det som blir kvar här är
// det importen inte kunde avgöra — noll eller flera namnträffar, eller ett jobb som aldrig ska kopplas (t.ex. "Flyttobjekt").
// Inget försvinner tyst: varje fil står kvar tills den kopplats. "Koppla till objekt" sparar numret som extra nummer på
// objektet Martin väljer, och listan läses om för att visa att kopplingen faktiskt syntes.
//
// Läser själv (hpr_filer, objekt, objekt_alt_nummer); skriver bara EN rad i objekt_alt_nummer (RLS: bara admin).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import {
  altNummerAttSkriva, okopplatJobb, troligaObjekt,
  type AltNummerRad, type HprFilRad, type ObjektNamnRad, type OkopplatJobb,
} from '@/lib/objektNummer';

const MAX_OBJEKT_I_VALJARE = 30;

type Status = 'laddar' | 'ok' | 'fel';

export default function OkopplFilerKort({ maskiner = {} }: { maskiner?: Record<string, string> }) {
  const [status, setStatus] = useState<Status>('laddar');
  const [filer, setFiler] = useState<HprFilRad[]>([]);
  const [objekt, setObjekt] = useState<ObjektNamnRad[]>([]);
  const [alias, setAlias] = useState<AltNummerRad[]>([]);
  const [tabellSaknas, setTabellSaknas] = useState(false);
  const [oppen, setOppen] = useState(false);
  const [valjerFor, setValjerFor] = useState<string | null>(null);     // nyckel/filnamn på jobbet vars väljare är öppen
  const [sok, setSok] = useState('');
  const [val, setVal] = useState<ObjektNamnRad | null>(null);
  const [sparar, setSparar] = useState(false);
  const [meddelande, setMeddelande] = useState('');

  const ladda = useCallback(async (): Promise<{ filer: HprFilRad[]; objekt: ObjektNamnRad[]; alias: AltNummerRad[] } | null> => {
    const [f, o, a] = await Promise.all([
      hamtaAlla<HprFilRad>(() => supabase.from('hpr_filer').select('filnamn, objekt_nyckel, fil_datum, stammar_count'), 'id'),
      hamtaAlla<ObjektNamnRad>(() => supabase.from('objekt').select('id, namn, vo_nummer'), 'id'),
      hamtaAlla<AltNummerRad>(() => supabase.from('objekt_alt_nummer').select('objekt_id, nummer, maskin_id'), 'id'),
    ]);
    // Saknad tabell (migrationen ej körd) är inte ett läsfel: det finns då inga extra nummer. Allt annat är det.
    const saknas = !!a.error && (a.error.code === 'PGRST205' || a.error.code === '42P01' || /does not exist|schema cache/i.test(String(a.error.message ?? '')));
    if (f.error || o.error || (a.error && !saknas)) { setStatus('fel'); return null; }
    setTabellSaknas(saknas);
    setFiler(f.data); setObjekt(o.data); setAlias(saknas ? [] : a.data);
    setStatus('ok');
    return { filer: f.data, objekt: o.data, alias: saknas ? [] : a.data };
  }, []);

  useEffect(() => { void ladda(); }, [ladda]);

  const jobb = useMemo(() => okopplatJobb(filer, objekt, alias), [filer, objekt, alias]);
  const idFor = (j: OkopplatJobb) => j.nyckel ?? j.filnamn;

  if (status === 'laddar') return null;
  if (status === 'fel') {
    return (
      <div data-testid="okoppl-fel" style={{ margin: `${AVSTAND.m}px ${AVSTAND.l}px`, padding: AVSTAND.m, borderRadius: RADIE.kort, background: FARG.kort, ...TYP.meta, color: FARG.rod, display: 'flex', gap: AVSTAND.m, alignItems: 'center' }}>
        <span style={{ flex: 1 }}>Kunde inte läsa filerna — listan över filer utan objekt kan inte visas.</span>
        <button type="button" onClick={() => { setStatus('laddar'); void ladda(); }} style={{ ...knappTertiar }}>Försök igen</button>
      </div>
    );
  }
  if (jobb.length === 0) return null;

  async function koppla(j: OkopplatJobb, mal: ObjektNamnRad) {
    const rad = altNummerAttSkriva(j, mal.id);
    if (!rad || sparar) return;
    setSparar(true);
    setMeddelande('');
    const { data, error } = await supabase.from('objekt_alt_nummer').insert(rad).select('id');
    if (error || !data || data.length === 0) {
      setMeddelande(
        error?.code === '23505' ? 'Numret är redan kopplat till ett objekt — ladda om sidan.'
        : tabellSaknas ? 'Kunde inte koppla — tabellen för extra nummer finns inte ännu (migrationen är inte körd).'
        : 'Kunde inte koppla — inget sparades.',
      );
      setSparar(false);
      return;
    }
    // Läs tillbaka: kopplingen räknas först när jobbet är borta ur listan vid omläsning.
    const ny = await ladda();
    setSparar(false);
    if (!ny) return;
    const kvar = okopplatJobb(ny.filer, ny.objekt, ny.alias).some((x) => idFor(x) === idFor(j));
    if (kvar) { setMeddelande('Kopplingen sparades men syntes inte vid omläsning — kontrollera numret.'); return; }
    setValjerFor(null); setVal(null); setSok('');
  }

  const valjareObjekt = (j: OkopplatJobb): { troliga: ObjektNamnRad[]; ovriga: ObjektNamnRad[] } => {
    const q = sok.trim().toLocaleLowerCase('sv');
    const troliga = troligaObjekt(j, objekt);
    const idn = new Set(troliga.map((o) => o.id));
    const ovriga = objekt
      .filter((o) => !idn.has(o.id) && (q === '' ? false : `${o.namn ?? ''} ${o.vo_nummer ?? ''}`.toLocaleLowerCase('sv').includes(q)))
      .sort((a, b) => String(a.namn ?? '').localeCompare(String(b.namn ?? ''), 'sv'))
      .slice(0, MAX_OBJEKT_I_VALJARE);
    return { troliga, ovriga };
  };

  const exempel = jobb.slice(0, 2).map((j) => j.namn || j.filnamn).join(', ');

  return (
    <section data-testid="okoppl-kort" aria-label="Filer utan objekt" style={{ margin: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.kort, overflow: 'hidden' }}>
      <button
        type="button"
        data-testid="okoppl-rubrik"
        aria-expanded={oppen}
        onClick={() => setOppen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, border: 'none', background: 'none', color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
      >
        <span aria-hidden="true" style={{ width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: RADIE.cirkel, flexShrink: 0, background: FARG.orange }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', ...TYP.listtitel }}>
            {jobb.length} {jobb.length === 1 ? 'fil hör' : 'filer hör'} inte till något objekt
          </span>
          <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Skotaren ser inga högar för dem · t.ex. {exempel}
          </span>
        </span>
        <span aria-hidden="true" style={{ color: FARG.text3, flexShrink: 0 }}>{oppen ? '▴' : '▾'}</span>
      </button>

      {oppen && jobb.map((j) => {
        const id = idFor(j);
        const valjer = valjerFor === id;
        const { troliga, ovriga } = valjer ? valjareObjekt(j) : { troliga: [], ovriga: [] };
        return (
          <div key={id} data-testid={`okoppl-rad-${id}`} style={{ borderTop: `1px solid ${FARG.linje}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.primar }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', ...TYP.listtitel, color: FARG.text, overflowWrap: 'anywhere' }}>{j.namn || 'Namnlös fil'}</span>
                <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere', ...TNUM }}>
                  {[
                    j.maskin ? (maskiner[j.maskin] || j.maskin) : null,
                    j.datum ? j.datum.slice(0, 10) : null,
                    j.stammar > 0 ? `${j.stammar.toLocaleString('sv-SE')} stammar` : null,
                    j.ident ? `nr ${j.ident}` : 'saknar nyckel',
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              {j.kanKopplas ? (
                <button
                  type="button"
                  data-testid={`okoppl-koppla-${id}`}
                  onClick={() => { setValjerFor(valjer ? null : id); setVal(null); setSok(''); setMeddelande(''); }}
                  style={{ ...knappSekundar, flexShrink: 0 }}
                >
                  Koppla till objekt
                </button>
              ) : (
                <span style={{ ...TYP.meta, color: FARG.text3, flexShrink: 0 }}>kan inte kopplas här</span>
              )}
            </div>

            {valjer && (
              <div data-testid={`okoppl-valjare-${id}`} style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                <input
                  type="search"
                  data-testid="okoppl-sok"
                  aria-label="Sök objekt"
                  placeholder="Sök objekt eller VO-nummer"
                  value={sok}
                  onChange={(e) => { setSok(e.target.value); setVal(null); }}
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.rad, background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit', ...TYP.text, outline: 'none' }}
                />
                {troliga.length > 0 && <div style={{ ...TYP.micro, color: FARG.text2 }}>Troligast — samma namn</div>}
                {[...troliga, ...ovriga].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    data-testid={`okoppl-objekt-${o.id}`}
                    aria-pressed={val?.id === o.id}
                    onClick={() => setVal(o)}
                    style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.rad, background: val?.id === o.id ? FARG.fyllning : FARG.upphojt, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', ...TYP.text, fontWeight: val?.id === o.id ? VIKT.halvfet : VIKT.normal }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{o.namn || 'Namnlöst objekt'}</span>
                    <span style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0, ...TNUM }}>VO {o.vo_nummer || '—'}</span>
                  </button>
                ))}
                {troliga.length === 0 && ovriga.length === 0 && (
                  <div style={{ ...TYP.meta, color: FARG.text2 }}>
                    {sok.trim() ? `Inget objekt matchar "${sok.trim()}".` : 'Inget objekt har samma namn. Sök på namn eller VO-nummer.'}
                  </div>
                )}
                {val && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, paddingTop: AVSTAND.s }}>
                    <div data-testid="okoppl-bekrafta-text" style={{ ...TYP.meta, color: FARG.text2 }}>
                      Nummer <span style={{ color: FARG.text }}>{j.ident}</span> sparas som extra nummer på <span style={{ color: FARG.text }}>{val.namn}</span>. Filerna med det numret visas då under objektet.
                    </div>
                    <button type="button" data-testid="okoppl-bekrafta" disabled={sparar} onClick={() => void koppla(j, val)} style={{ ...knappPrimar, opacity: sparar ? 0.4 : 1 }}>
                      {sparar ? 'Kopplar …' : 'Koppla'}
                    </button>
                  </div>
                )}
                {meddelande && <div data-testid="okoppl-meddelande" role="alert" style={{ ...TYP.meta, color: FARG.rod }}>{meddelande}</div>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

const knappBas: React.CSSProperties = { border: 'none', fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation' };
const knappSekundar: React.CSSProperties = { ...knappBas, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.knapp, background: FARG.fyllning, color: FARG.text, ...TYP.meta, fontWeight: VIKT.halvfet };
const knappPrimar: React.CSSProperties = { ...knappBas, width: '100%', minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, background: FARG.text, color: FARG.bg, ...TYP.listtitel };
const knappTertiar: React.CSSProperties = { ...knappBas, minHeight: TRAFFYTA.min, padding: 0, background: 'none', color: FARG.text2, ...TYP.meta };
