'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { upsertVerifierat, uppdateraVerifierat } from '@/lib/supabase-save';
import { C, ff, inputStyle, labelStyle, TYPINFO, type LedighetTyp } from './tema';
import { arbetsdagar, fmtDatum, fmtPeriod } from './datum';
import type { Ansokan } from './typer';
import ValjKalender from './ValjKalender';

/**
 * Ansökningsformulär som bottom sheet. Skapar (status='väntar',
 * medarbetare_id=egen — RLS kräver båda) eller redigerar en egen väntande rad.
 * Saldot blockerar ALDRIG ansökan — det är informativt, inte en spärr.
 */
export default function AnsokFormular({
  redigerar, egenId, egenNamn, ansokningar, onStang, onSparad,
}: {
  redigerar: Ansokan | null; // null = ny ansökan
  egenId: string;
  egenNamn: string;
  ansokningar: Ansokan[];
  onStang: () => void;
  onSparad: () => void;
}) {
  const [typ, setTyp] = useState<LedighetTyp | ''>(redigerar?.typ ?? '');
  // Periodval via tryck-kalendern: start utan slut = endagsperiod tills vidare
  const [start, setStart] = useState<string | null>(redigerar?.startdatum ?? null);
  const [slut, setSlut] = useState<string | null>(redigerar?.slutdatum ?? null);
  const [kommentar, setKommentar] = useState(redigerar?.kommentar ?? '');
  const [sparar, setSparar] = useState(false);
  const [sparfel, setSparfel] = useState<string | null>(null);

  useEffect(() => { setSparfel(null); }, [typ, start, slut]);

  const effektivtSlut = slut ?? start ?? '';

  // Blockerande: egen godkänd ledighet i intervallet (dubbelbokning)
  const dubbelbokning = useMemo(() => {
    if (!start) return null;
    const overlap = ansokningar.find(a =>
      a.id !== redigerar?.id &&
      a.medarbetare_id === egenId &&
      a.status === 'godkänd' &&
      a.startdatum <= effektivtSlut &&
      a.slutdatum >= start
    );
    if (!overlap) return null;
    const ti = TYPINFO[overlap.typ] ?? TYPINFO.semester;
    return `Du har redan godkänd ${ti.label.toLowerCase()} ${fmtDatum(overlap.startdatum)} – ${fmtDatum(overlap.slutdatum)}`;
  }, [start, effektivtSlut, ansokningar, egenId, redigerar]);

  // Icke-blockerande: andras godkända ledighet samma datum (kollision)
  const kollision = useMemo(() => {
    if (!start) return [];
    const namn: string[] = [];
    for (const a of ansokningar) {
      if (a.medarbetare_id === egenId || a.status !== 'godkänd') continue;
      if (a.startdatum <= effektivtSlut && a.slutdatum >= start) {
        if (!namn.includes(a.anvandare_id)) namn.push(a.anvandare_id);
      }
    }
    return namn;
  }, [start, effektivtSlut, ansokningar, egenId]);

  const kanSkicka = !!typ && !!start && !dubbelbokning && !sparar;

  const spara = async () => {
    if (!kanSkicka || !start) return;
    setSparar(true);
    setSparfel(null);

    const res = redigerar
      ? await uppdateraVerifierat(supabase, 'ledighet_ansokningar', {
          typ, startdatum: start, slutdatum: effektivtSlut, kommentar: kommentar || null,
        }, { id: redigerar.id, medarbetare_id: egenId })
      : await upsertVerifierat(supabase, 'ledighet_ansokningar', {
          medarbetare_id: egenId,
          anvandare_id: egenNamn,
          typ,
          startdatum: start,
          slutdatum: effektivtSlut,
          status: 'väntar',
          kommentar: kommentar || null,
          skapad_av: egenNamn,
        });

    setSparar(false);
    if (!res.ok) {
      setSparfel(res.fel);
      return;
    }
    onSparad();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: ff }}>
      <div onClick={onStang} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480,
        background: C.surface, borderRadius: '20px 20px 0 0', padding: '24px 20px 32px',
        maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: C.t4, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, marginBottom: 16 }}>
          {redigerar ? 'Ändra ansökan' : 'Ansök om ledighet'}
        </div>

        {/* Typval — bara Semester/ATK; stopp är en egen modell, inte ledighet */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(Object.keys(TYPINFO) as LedighetTyp[]).map(val => {
            const aktiv = typ === val;
            return (
              <button key={val} onClick={() => setTyp(val)} style={{
                flex: 1, height: 48, borderRadius: 12,
                background: aktiv ? '#fff' : 'rgba(255,255,255,0.06)',
                border: aktiv ? 'none' : '1px solid rgba(255,255,255,0.1)',
                color: aktiv ? '#111' : '#fff',
                fontSize: 15, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
              }}>
                {TYPINFO[val].label}
              </button>
            );
          })}
        </div>

        {/* Tryck-kalender: tryck startdag, tryck slutdag — spannet fylls i */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '12px 10px 8px', marginBottom: 10,
        }}>
          <ValjKalender
            valdStart={start}
            valdSlut={slut}
            onValj={(s, e) => { setStart(s); setSlut(e); }}
          />
        </div>

        {/* Vald period + arbetsdagar, räknas om medan man trycker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 34, marginBottom: 12 }}>
          {start ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>
                {fmtPeriod(start, effektivtSlut)}
              </div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
                {(() => {
                  const ad = arbetsdagar(start, effektivtSlut);
                  return `${ad} arbetsdag${ad === 1 ? '' : 'ar'} · helg och röda dagar räknas inte`;
                })()}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.t3 }}>Tryck på en dag i kalendern för att välja period</div>
          )}
          {start && (
            <button
              type="button"
              onClick={() => { setStart(null); setSlut(null); }}
              style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                color: C.t2, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                fontFamily: ff, padding: '6px 12px', flexShrink: 0,
              }}
            >
              Rensa
            </button>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>KOMMENTAR</div>
          <textarea placeholder="Valfritt..." value={kommentar} onChange={e => setKommentar(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
        </div>

        {dubbelbokning && (
          <div style={{ padding: '12px 14px', background: C.nekadDim, border: '1px solid rgba(190,24,93,0.25)', borderRadius: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: C.nekad, lineHeight: 1.5 }}>{dubbelbokning}</span>
          </div>
        )}

        {!dubbelbokning && kollision.length > 0 && (
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: '#fb923c', lineHeight: 1.4 }}>
              <strong>Krock</strong> — {kollision.join(' och ')} har godkänd ledighet under dessa datum. Du kan ändå ansöka.
            </span>
          </div>
        )}

        {sparfel && (
          <div style={{ padding: '12px 14px', background: C.redDim, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: C.red, lineHeight: 1.4 }}>{sparfel}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onStang} style={{ background: 'none', border: 'none', color: C.t2, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: ff, padding: '10px 16px' }}>
            Avbryt
          </button>
          <button onClick={spara} disabled={!kanSkicka} style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: C.blue, color: '#fff',
            fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
            opacity: kanSkicka ? 1 : 0.5,
          }}>
            {sparar ? 'Sparar...' : redigerar ? 'Spara ändring' : 'Skicka ansökan'}
          </button>
        </div>
      </div>
    </div>
  );
}
