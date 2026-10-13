'use client';

import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { raderaVerifierat, upsertVerifierat } from '@/lib/supabase-save';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import { FelText, Ikon, KORT_TEXTKNAPP } from './delar';
import { arbetsdagar, fmtPeriod, kalenderdagar } from './datum';
import ValjKalender from './ValjKalender';
import type { SchemaMaskin } from './useSchemaData';

const ORSAKER = [
  { varde: 'semesterstopp', label: 'Semesterstopp' },
  { varde: 'produktionsbegransning', label: 'Produktionsbegränsning' },
] as const;

type Orsak = (typeof ORSAKER)[number]['varde'];

/**
 * "Lägg till stopp" — bara för godkännare (admin); RLS spärrar ändå
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
  // Död knapp utan förklaring förvirrar — visa vad som saknas, live
  const saknas: string[] = [];
  if (valdaIds.length === 0) saknas.push('maskin');
  if (!orsak) saknas.push('orsak');
  if (!start) saknas.push('datum');
  const kanSpara = saknas.length === 0 && !sparar;

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

    // 2) Maskinraderna — "Alla" är redan expanderad till explicita id:n.
    // OBS: stopp_maskin har ingen id-kolumn (PK = stopp_id+maskin_id) —
    // default-select 'id' ger 400 från PostgREST.
    const maskinRes = await upsertVerifierat(supabase, 'stopp_maskin',
      valdaIds.map(mid => ({ stopp_id: stoppId, maskin_id: mid })),
      { select: 'stopp_id,maskin_id' });
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

  // Valbar knapp: vald = FARG.fyllning + 600 + bock (som PeriodForm). Ingen röd fyllning:
  // röd är för "radera", inte för att välja.
  const chip = (aktiv: boolean): React.CSSProperties => ({
    ...KNAPP.sekundar, width: 'auto', padding: `0 ${AVSTAND.m}px`, ...TYP.meta, gap: AVSTAND.xs,
    fontWeight: aktiv ? VIKT.halvfet : VIKT.normal,
    background: aktiv ? FARG.fyllning : FARG.tonad, color: aktiv ? FARG.text : FARG.text2,
  });
  const etikett = (text: string) => <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>{text}</p>;

  return (
    <Ark
      rubrik="Lägg till stopp"
      onStang={onStang}
      fot={
        <>
          {/* Död knapp utan förklaring förvirrar — säg vad som saknas, i ord */}
          {saknas.length > 0 && <p style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>Välj {saknas.join(' + ')} för att spara</p>}
          <FelText text={sparfel} />
          <button onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? {} : INAKTIV) }}>
            {sparar ? 'Sparar…' : 'Spara stopp'}
          </button>
        </>
      }
    >
      {/* Maskinval — flerval, "Alla" expanderas vid sparning */}
      {etikett('Maskiner')}
      <button type="button" onClick={() => { setAlla(!alla); setValda(new Set()); }} aria-pressed={alla}
        style={{ ...chip(alla), width: '100%', justifyContent: 'flex-start' }}>
        {alla && <Ikon namn="check" />}Alla maskiner{alla ? ` — ${maskiner.length} st` : ''}
      </button>
      {grupper.map(g => (
        <div key={g.rubrik} style={{ marginTop: AVSTAND.m }}>
          <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>{g.rubrik}</p>
          <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap' }}>
            {g.maskiner.map(m => {
              const vald = !alla && valda.has(m.maskin_id);
              return (
                <button key={m.maskin_id} type="button" onClick={() => toggla(m.maskin_id)} aria-pressed={vald} style={chip(vald)}>
                  {vald && <Ikon namn="check" />}{m.namn}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Orsak — exakt två val */}
      {etikett('Orsak')}
      <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap' }}>
        {ORSAKER.map(o => {
          const aktiv = orsak === o.varde;
          return (
            <button key={o.varde} type="button" onClick={() => setOrsak(o.varde)} aria-pressed={aktiv} style={{ ...chip(aktiv), flex: 1 }}>
              {aktiv && <Ikon namn="check" />}{o.label}
            </button>
          );
        })}
      </div>

      {/* Datum — samma tryck-kalender som ansök-flödet */}
      {etikett('Period')}
      <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: `${AVSTAND.s}px ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
        <ValjKalender valdStart={start} valdSlut={slut} onValj={(s, e) => { setStart(s); setSlut(e); }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, minHeight: TRAFFYTA.min, marginTop: AVSTAND.s }}>
        {start ? (
          <div>
            <div style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{fmtPeriod(start, effektivtSlut)}</div>
            <div style={{ ...TYP.meta, ...TNUM, marginTop: AVSTAND.xs, color: FARG.text2 }}>
              {kalenderdagar(start, effektivtSlut)} dagar ({arbetsdagar(start, effektivtSlut)} arbetsdagar)
            </div>
          </div>
        ) : (
          <span style={{ ...TYP.meta, color: FARG.text2 }}>Tryck på en dag i kalendern</span>
        )}
        {start && <button type="button" onClick={() => { setStart(null); setSlut(null); }} style={{ ...KNAPP.tertiar, ...KORT_TEXTKNAPP }}>Rensa</button>}
      </div>

      {/* Kommentar */}
      {etikett('Kommentar (valfritt)')}
      <input placeholder='Valfritt — t.ex. "fullt gallringslager"' value={kommentar} onChange={e => setKommentar(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.m}px`, background: FARG.upphojt, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', colorScheme: 'dark' }} />
    </Ark>
  );
}
