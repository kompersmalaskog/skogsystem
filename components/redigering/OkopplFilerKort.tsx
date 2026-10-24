'use client';

// FILER UTAN OBJEKT — HPR-filer vars ordernummer varken är något objekts vo_nummer eller ett extra nummer
// (tabellen objekt_alt_nummer). Planeringsvyn kan inte visa dem under något objekt, så skotaren får inga produktionshögar.
// Importen kopplar via exakt namnträff (objekt_koppling.py); det som blir kvar här är det importen inte kunde avgöra — noll eller
// flera namnträffar, eller ett jobb som aldrig ska kopplas (t.ex. "Flyttobjekt"). Inget försvinner tyst: varje fil står kvar tills den
// kopplats eller ignorerats.
//
//  • Koppla till objekt: sparar numret som extra nummer på objektet Martin väljer; listan läses om och kopplingen räknas som lyckad
//    först när filen försvunnit ur listan.
//  • Ignorera: döljer jobbet (hpr_ignorerad). Inget raderas — "Visa ignorerade" tar fram dem igen.
//  • Bytte nummer: vid namnträff byter importen objekt.vo_nummer till filens nummer (och sparar det gamla som extra nummer) när det
//    gamla numret saknar maskindata. Varje byte syns här som en rad med Ångra.
//
// Läser själv (hpr_filer, objekt, objekt_alt_nummer, hpr_ignorerad); skriver bara via RLS (admin).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import {
  altNummerAttSkriva, angraNummerbyte, delaIgnorerade, ignoreradNyckel, nummerbyten, okopplatJobb, troligaObjekt,
  type AltNummerRad, type HprFilRad, type Nummerbyte, type ObjektNamnRad, type OkopplatJobb,
} from '@/lib/objektNummer';

const MAX_OBJEKT_I_VALJARE = 30;

type Status = 'laddar' | 'ok' | 'fel';
interface Data { filer: HprFilRad[]; objekt: ObjektNamnRad[]; alias: AltNummerRad[]; ignorerade: Set<string> }

const tabellSaknasFel = (e: any) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|schema cache/i.test(String(e.message ?? '')));
const kolumnSaknasFel = (e: any) => !!e && (e.code === '42703' || /column .* does not exist|could not find .* column/i.test(String(e.message ?? '')));

export default function OkopplFilerKort({ maskiner = {}, startOppen = false }: { maskiner?: Record<string, string>; startOppen?: boolean }) {
  const [status, setStatus] = useState<Status>('laddar');
  const [data, setData] = useState<Data>({ filer: [], objekt: [], alias: [], ignorerade: new Set() });
  const [tabellSaknas, setTabellSaknas] = useState(false);          // objekt_alt_nummer
  const [ignorTabellSaknas, setIgnorTabellSaknas] = useState(false); // hpr_ignorerad
  const [oppen, setOppen] = useState(startOppen);
  const [visaIgnorerade, setVisaIgnorerade] = useState(false);
  const [valjerFor, setValjerFor] = useState<string | null>(null);   // nyckel/filnamn på jobbet vars väljare är öppen
  const [sok, setSok] = useState('');
  const [val, setVal] = useState<ObjektNamnRad | null>(null);
  const [sparar, setSparar] = useState(false);
  const [meddelande, setMeddelande] = useState('');

  const ladda = useCallback(async (): Promise<Data | null> => {
    const aliasKolumner = 'id, objekt_id, nummer, maskin_id, byte_till';
    const [f, o, a0, ig] = await Promise.all([
      hamtaAlla<HprFilRad>(() => supabase.from('hpr_filer').select('filnamn, objekt_nyckel, fil_datum, tid_ar_utc, stammar_count'), 'id'),
      hamtaAlla<ObjektNamnRad>(() => supabase.from('objekt').select('id, namn, vo_nummer'), 'id'),
      hamtaAlla<AltNummerRad>(() => supabase.from('objekt_alt_nummer').select(aliasKolumner), 'id'),
      hamtaAlla<{ nyckel: string }>(() => supabase.from('hpr_ignorerad').select('nyckel'), 'nyckel'),
    ]);
    // byte_till saknas (andra migrationen ej körd) → läs om utan kolumnen: det finns då inga byten att visa
    const a = a0.error && kolumnSaknasFel(a0.error)
      ? await hamtaAlla<AltNummerRad>(() => supabase.from('objekt_alt_nummer').select('id, objekt_id, nummer, maskin_id'), 'id')
      : a0;
    // Saknad tabell (migrationen ej körd) är inte ett läsfel: det finns då inga extra nummer / ignorerade. Allt annat är det.
    const aSaknas = !!a.error && tabellSaknasFel(a.error);
    const igSaknas = !!ig.error && tabellSaknasFel(ig.error);
    if (f.error || o.error || (a.error && !aSaknas) || (ig.error && !igSaknas)) { setStatus('fel'); return null; }
    setTabellSaknas(aSaknas);
    setIgnorTabellSaknas(igSaknas);
    const ny: Data = { filer: f.data, objekt: o.data, alias: aSaknas ? [] : a.data, ignorerade: new Set(igSaknas ? [] : ig.data.map((r) => r.nyckel)) };
    setData(ny);
    setStatus('ok');
    return ny;
  }, []);

  useEffect(() => { void ladda(); }, [ladda]);

  const { filer, objekt, alias, ignorerade } = data;
  const okopplade = useMemo(() => okopplatJobb(filer, objekt, alias), [filer, objekt, alias]);
  const delat = useMemo(() => delaIgnorerade(okopplade, ignorerade), [okopplade, ignorerade]);
  const byten = useMemo(() => nummerbyten(alias, objekt), [alias, objekt]);
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
  const synliga = delat.synliga;
  const dolda = delat.ignorerade;
  if (synliga.length === 0 && byten.length === 0 && dolda.length === 0) return null;

  async function koppla(j: OkopplatJobb, mal: ObjektNamnRad) {
    const rad = altNummerAttSkriva(j, mal.id);
    if (!rad || sparar) return;
    setSparar(true);
    setMeddelande('');
    const { data: skrivet, error } = await supabase.from('objekt_alt_nummer').insert(rad).select('id');
    if (error || !skrivet || skrivet.length === 0) {
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
    const kvar = delaIgnorerade(okopplatJobb(ny.filer, ny.objekt, ny.alias), ny.ignorerade).synliga.some((x) => idFor(x) === idFor(j));
    if (kvar) { setMeddelande('Kopplingen sparades men syntes inte vid omläsning — kontrollera numret.'); return; }
    setValjerFor(null); setVal(null); setSok('');
  }

  async function ignorera(j: OkopplatJobb) {
    if (sparar) return;
    setSparar(true);
    setMeddelande('');
    const { data: skrivet, error } = await supabase.from('hpr_ignorerad').insert({ nyckel: ignoreradNyckel(j) }).select('nyckel');
    if (error || !skrivet || skrivet.length === 0) {
      setMeddelande(ignorTabellSaknas ? 'Kunde inte ignorera — tabellen finns inte ännu (migrationen är inte körd).' : 'Kunde inte ignorera — inget sparades.');
      setSparar(false);
      return;
    }
    const ny = await ladda();
    setSparar(false);
    if (ny && !ny.ignorerade.has(ignoreradNyckel(j))) setMeddelande('Ignoreringen sparades men syntes inte vid omläsning.');
    if (valjerFor === idFor(j)) { setValjerFor(null); setVal(null); }
  }

  async function visaIgen(j: OkopplatJobb) {
    if (sparar) return;
    setSparar(true);
    setMeddelande('');
    const { error } = await supabase.from('hpr_ignorerad').delete().eq('nyckel', ignoreradNyckel(j));
    if (error) { setMeddelande('Kunde inte visa filen igen — inget ändrades.'); setSparar(false); return; }
    const ny = await ladda();
    setSparar(false);
    if (ny && ny.ignorerade.has(ignoreradNyckel(j))) setMeddelande('Filen visades inte igen vid omläsning.');
  }

  async function angra(b: Nummerbyte) {
    if (sparar) return;
    setSparar(true);
    setMeddelande('');
    const res = await angraNummerbyte(supabase, b);
    const ny = await ladda();
    setSparar(false);
    if (!res.ok) { setMeddelande(res.fel); return; }
    if (ny && nummerbyten(ny.alias, ny.objekt).some((x) => x.aliasId === b.aliasId)) setMeddelande('Ångrandet syntes inte vid omläsning.');
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

  const n = synliga.length;
  const rubrik = n > 0
    ? `${n} ${n === 1 ? 'fil hör' : 'filer hör'} inte till något objekt${byten.length > 0 ? ` · ${byten.length} bytte nummer` : ''}`
    : byten.length > 0 ? `${byten.length} ${byten.length === 1 ? 'objekt bytte' : 'objekt bytte'} nummer` : 'Inga filer utan objekt';
  const underrad = n > 0
    ? `Skotaren ser inga högar för dem · t.ex. ${synliga.slice(0, 2).map((j) => j.namn || j.filnamn).join(', ')}`
    : byten.length > 0 ? 'Importen bytte objektets nummer — Ångra om det blev fel' : `${dolda.length} ${dolda.length === 1 ? 'ignorerad fil' : 'ignorerade filer'}`;

  const jobbRad = (j: OkopplatJobb, dold: boolean) => {
    const id = idFor(j);
    const valjer = !dold && valjerFor === id;
    const { troliga, ovriga } = valjer ? valjareObjekt(j) : { troliga: [], ovriga: [] };
    return (
      <div key={id} data-testid={`okoppl-rad-${id}`} style={{ borderTop: `1px solid ${FARG.linje}`, opacity: dold ? 0.6 : 1 }}>
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
          {dold ? (
            <button type="button" data-testid={`okoppl-visaigen-${id}`} disabled={sparar} onClick={() => void visaIgen(j)} style={{ ...knappTertiar, flexShrink: 0 }}>Visa igen</button>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, flexShrink: 0 }}>
              {j.kanKopplas ? (
                <button
                  type="button"
                  data-testid={`okoppl-koppla-${id}`}
                  onClick={() => { setValjerFor(valjer ? null : id); setVal(null); setSok(''); setMeddelande(''); }}
                  style={knappSekundar}
                >
                  Koppla till objekt
                </button>
              ) : (
                <span style={{ ...TYP.meta, color: FARG.text3 }}>kan inte kopplas här</span>
              )}
              <button type="button" data-testid={`okoppl-ignorera-${id}`} disabled={sparar} onClick={() => void ignorera(j)} style={knappTertiar}>Ignorera</button>
            </span>
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
          </div>
        )}
      </div>
    );
  };

  return (
    <section data-testid="okoppl-kort" aria-label="Filer utan objekt" style={{ margin: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.kort, overflow: 'hidden' }}>
      <button
        type="button"
        data-testid="okoppl-rubrik"
        aria-expanded={oppen}
        onClick={() => setOppen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, border: 'none', background: 'none', color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
      >
        <span aria-hidden="true" style={{ width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: RADIE.cirkel, flexShrink: 0, background: n > 0 ? FARG.orange : FARG.text3 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', ...TYP.listtitel }}>{rubrik}</span>
          <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{underrad}</span>
        </span>
        <span aria-hidden="true" style={{ color: FARG.text3, flexShrink: 0 }}>{oppen ? '▴' : '▾'}</span>
      </button>

      {oppen && synliga.map((j) => jobbRad(j, false))}

      {oppen && byten.map((b) => (
        <div key={b.aliasId} data-testid={`okoppl-byte-${b.aliasId}`} style={{ borderTop: `1px solid ${FARG.linje}`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.primar }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span data-testid="okoppl-byte-text" style={{ display: 'block', ...TYP.listtitel, color: FARG.text, overflowWrap: 'anywhere', ...TNUM }}>
              Bytte nummer: {b.objektNamn || 'Namnlöst objekt'} {b.gammalt} → {b.nytt}
            </span>
            <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>
              Det gamla numret hade ingen maskindata. Ångra sätter tillbaka {b.gammalt} och sparar {b.nytt} som extra nummer.
            </span>
          </span>
          <button type="button" data-testid={`okoppl-angra-${b.aliasId}`} disabled={sparar} onClick={() => void angra(b)} style={{ ...knappSekundar, flexShrink: 0 }}>Ångra</button>
        </div>
      ))}

      {oppen && dolda.length > 0 && (
        <div style={{ borderTop: `1px solid ${FARG.linje}` }}>
          <button
            type="button"
            data-testid="okoppl-visa-ignorerade"
            aria-expanded={visaIgnorerade}
            onClick={() => setVisaIgnorerade((v) => !v)}
            style={{ ...knappTertiar, width: '100%', justifyContent: 'flex-start', padding: `0 ${AVSTAND.l}px` }}
          >
            {visaIgnorerade ? 'Dölj ignorerade' : 'Visa ignorerade'} ({dolda.length})
          </button>
          {visaIgnorerade && dolda.map((j) => jobbRad(j, true))}
        </div>
      )}

      {oppen && meddelande && (
        <div data-testid="okoppl-meddelande" role="alert" style={{ ...TYP.meta, color: FARG.rod, padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.m}px` }}>{meddelande}</div>
      )}
    </section>
  );
}

const knappBas: React.CSSProperties = { border: 'none', fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation' };
const knappSekundar: React.CSSProperties = { ...knappBas, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.knapp, background: FARG.fyllning, color: FARG.text, ...TYP.meta, fontWeight: VIKT.halvfet };
const knappPrimar: React.CSSProperties = { ...knappBas, width: '100%', minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, background: FARG.text, color: FARG.bg, ...TYP.listtitel };
const knappTertiar: React.CSSProperties = { ...knappBas, display: 'inline-flex', alignItems: 'center', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.s}px`, background: 'none', color: FARG.text2, ...TYP.meta };
