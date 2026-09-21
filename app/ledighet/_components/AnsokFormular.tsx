'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { upsertVerifierat, uppdateraVerifierat } from '@/lib/supabase-save';
import { rodaVardagarForByte, rodVardagNamn } from '@/lib/franvaro';
import { C, ff, inputStyle, labelStyle, TYPINFO, ANSOKBARA_TYPER, type LedighetTyp } from './tema';
import { arbetsdagar, arHelg, fmtDatum, fmtPeriod, toISO } from './datum';
import type { Ansokan } from './typer';
import ValjKalender from './ValjKalender';

/**
 * Ansökningsformulär som bottom sheet. Skapar (status='väntar',
 * medarbetare_id=egen — RLS kräver båda) eller redigerar en egen väntande rad.
 * Saldot blockerar ALDRIG ansökan — det är informativt, inte en spärr.
 *
 * Inarbetad dag (bytesdag, Skogsavtalet §5 mom 4): man jobbar en röd vardag
 * och är ledig en annan vardag i stället. EN ledig dag + vilken röd dag den
 * ersätter (bara röda VARDAGAR ur lib/roda-dagar, samma källa som kalendern
 * och helglönen). Helglönen flyttas inte. Ansöks och godkänns som annan
 * ledighet — avtalet: ledighet och inarbetning överenskoms samtidigt.
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
  const [ersatter, setErsatter] = useState<string | null>(redigerar?.ersatter_datum ?? null);
  const [kommentar, setKommentar] = useState(redigerar?.kommentar ?? '');
  const [sparar, setSparar] = useState(false);
  const [sparfel, setSparfel] = useState<string | null>(null);

  useEffect(() => { setSparfel(null); }, [typ, start, slut, ersatter]);

  const arByte = typ === 'inarbetad';
  // Bytesdag är alltid EN dag — slut följer start
  const effektivtSlut = arByte ? (start ?? '') : (slut ?? start ?? '');

  // Röda vardagar att välja bland: kring den lediga dagen (eller idag), minus
  // dem den här personen redan bytt bort (väntar/godkänd, inte den här raden).
  const rodaVal = useMemo(() => {
    if (!arByte) return [];
    const kring = start ?? toISO(new Date());
    const upptagna = new Set(
      ansokningar
        .filter(a => a.id !== redigerar?.id && a.medarbetare_id === egenId && a.typ === 'inarbetad' && a.status !== 'nekad' && a.ersatter_datum)
        .map(a => a.ersatter_datum as string),
    );
    return rodaVardagarForByte(kring).filter(r => !upptagna.has(r.datum));
  }, [arByte, start, ansokningar, egenId, redigerar]);

  // Den lediga dagen i ett byte måste vara en vanlig vardag
  const ledigDagFel = useMemo(() => {
    if (!arByte || !start) return null;
    if (arHelg(start)) return 'Den lediga dagen måste vara en vardag (mån–fre).';
    if (rodVardagNamn(start)) return `${start.slice(8)} ${fmtDatum(start).split(' ')[1]} är redan röd dag (${rodVardagNamn(start)}) — välj en vanlig vardag.`;
    if (ersatter && ersatter === start) return 'Den lediga dagen kan inte vara samma som den röda.';
    return null;
  }, [arByte, start, ersatter]);

  // Blockerande: egen godkänd ledighet i intervallet (dubbelbokning)
  const dubbelbokning = useMemo(() => {
    if (!start) return null;
    const overlap = ansokningar.find(a =>
      a.id !== redigerar?.id &&
      a.medarbetare_id === egenId &&
      (a.status === 'godkänd' || a.status === 'registrerad') &&
      a.startdatum <= effektivtSlut &&
      a.slutdatum >= start
    );
    if (!overlap) return null;
    const ti = TYPINFO[overlap.typ] ?? TYPINFO.semester;
    return `Du har redan ${overlap.status === 'registrerad' ? 'registrerad' : 'godkänd'} ${ti.label.toLowerCase()} ${fmtDatum(overlap.startdatum)} – ${fmtDatum(overlap.slutdatum)}`;
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

  // Död knapp utan förklaring förvirrar — visa vad som saknas, live.
  // Dubbelbokning behöver ingen rad: den visar redan sin egen varningsruta.
  const saknas: string[] = [];
  if (!typ) saknas.push('typ');
  if (!start) saknas.push(arByte ? 'ledig dag' : 'datum');
  if (arByte && !ersatter) saknas.push('röd dag');
  const kanSkicka = saknas.length === 0 && !dubbelbokning && !ledigDagFel && !sparar;

  const valjTyp = (val: LedighetTyp) => {
    setTyp(val);
    if (val !== 'inarbetad') setErsatter(null);
    else if (start) setSlut(start);
  };

  const spara = async () => {
    if (!kanSkicka || !start) return;
    setSparar(true);
    setSparfel(null);

    const falt = {
      typ, startdatum: start, slutdatum: effektivtSlut, kommentar: kommentar || null,
      ersatter_datum: arByte ? ersatter : null,
    };
    const res = redigerar
      ? await uppdateraVerifierat(supabase, 'ledighet_ansokningar', falt, { id: redigerar.id, medarbetare_id: egenId })
      : await upsertVerifierat(supabase, 'ledighet_ansokningar', {
          medarbetare_id: egenId,
          anvandare_id: egenNamn,
          ...falt,
          status: 'väntar',
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

        {/* Typval — bara det som går att ANSÖKA om (tema.ANSOKBARA_TYPER); TYPINFO
            täcker alla nio typer i tabellen men sjuk/vab anmäls i morgonkortet. */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {ANSOKBARA_TYPER.map(val => {
            const aktiv = typ === val;
            return (
              <button key={val} onClick={() => valjTyp(val)} style={{
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

        {arByte && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
              Du jobbar en röd vardag och är ledig en annan vardag i stället (Skogsavtalet §5 mom 4). Lön enligt schemat, inget avdrag för den lediga dagen. Helglönen flyttas inte.
            </span>
          </div>
        )}

        {/* Tryck-kalender: tryck startdag, tryck slutdag — spannet fylls i.
            Bytesdag: en dag, slut = start. */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '12px 10px 8px', marginBottom: 10,
        }}>
          <ValjKalender
            valdStart={start}
            valdSlut={arByte ? start : slut}
            onValj={(s, e) => { setStart(s); setSlut(arByte ? s : e); }}
          />
        </div>

        {/* Vald period + arbetsdagar, räknas om medan man trycker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 34, marginBottom: 12 }}>
          {start ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>
                {arByte ? `Ledig ${fmtPeriod(start, start)}` : fmtPeriod(start, effektivtSlut)}
              </div>
              <div style={{ fontSize: 12, color: ledigDagFel ? C.red : C.t3, marginTop: 2 }}>
                {ledigDagFel ?? (arByte ? 'en vardag som byts mot den röda dagen nedan' : (() => {
                  const ad = arbetsdagar(start, effektivtSlut);
                  return `${ad} arbetsdag${ad === 1 ? '' : 'ar'} · helg och röda dagar räknas inte`;
                })())}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.t3 }}>{arByte ? 'Tryck på den vardag du vill vara ledig' : 'Tryck på en dag i kalendern för att välja period'}</div>
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

        {/* Bytesdag: vilken röd vardag som arbetas i stället — bara ur lib/roda-dagar */}
        {arByte && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>ERSÄTTER RÖD DAG</div>
            {rodaVal.length === 0 ? (
              <div style={{ fontSize: 13, color: C.t3 }}>Ingen röd vardag inom ett halvår som inte redan är bytt.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rodaVal.map(r => {
                  const aktiv = ersatter === r.datum;
                  return (
                    <button key={r.datum} type="button" onClick={() => setErsatter(r.datum)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                      background: aktiv ? '#fff' : 'rgba(255,255,255,0.06)',
                      border: aktiv ? 'none' : '1px solid rgba(255,255,255,0.1)',
                      color: aktiv ? '#111' : '#fff', fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                    }}>
                      <span>{r.namn}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: aktiv ? '#444' : C.t3 }}>{fmtDatum(r.datum)} {r.datum.slice(0, 4)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          {saknas.length > 0 && (
            <span style={{ fontSize: 12, color: C.t3, marginRight: 'auto' }}>
              Välj {saknas.join(' + ')} för att skicka
            </span>
          )}
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
