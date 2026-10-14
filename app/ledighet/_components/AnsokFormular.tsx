'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { upsertVerifierat, uppdateraVerifierat } from '@/lib/supabase-save';
import { rodaVardagarForByte, rodVardagNamn, bytesdagFel } from '@/lib/franvaro';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import { TYPINFO, TYPKORT, ANSOKBARA_TYPER, type LedighetTyp } from './tema';
import { FelText, Ikon, KORT_TEXTKNAPP } from './delar';
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
  redigerar, egenId, egenNamn, ansokningar, onStang, onSparad, startTyp = null,
}: {
  redigerar: Ansokan | null; // null = ny ansökan
  egenId: string;
  egenNamn: string;
  ansokningar: Ansokan[];
  onStang: () => void;
  onSparad: () => void;
  /** Förvald typ för en NY ansökan ("Ansök om andra datum" efter ett avslag). Bara startvärdet — inget annat ändras. */
  startTyp?: LedighetTyp | null;
}) {
  const [typ, setTyp] = useState<LedighetTyp | ''>(redigerar?.typ ?? startTyp ?? '');
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

  // Den lediga dagen i ett byte måste vara en vanlig vardag — samma regler som
  // Arbetsrapportens Bekräfta-fråga (lib/franvaro.bytesdagFel).
  const ledigDagFel = useMemo(() => {
    if (!arByte || !start) return null;
    if (arHelg(start)) return 'Den lediga dagen måste vara en vardag (mån–fre).';
    if (rodVardagNamn(start)) return `${fmtDatum(start)} är redan röd dag (${rodVardagNamn(start)}) — välj en vanlig vardag.`;
    if (ersatter) return bytesdagFel(start, ersatter);
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

  // Valbar knapp i arket: vald = FARG.fyllning + 600 + bock (PeriodForm), aldrig en andra vit
  // fyllning — arkets enda primära knapp är Skicka.
  const val = (vald: boolean): React.CSSProperties => ({
    ...KNAPP.sekundar, flex: 1, width: 'auto', padding: `0 ${AVSTAND.m}px`, ...TYP.meta,
    fontWeight: vald ? VIKT.halvfet : VIKT.normal,
    background: vald ? FARG.fyllning : FARG.tonad, color: vald ? FARG.text : FARG.text2, gap: AVSTAND.xs,
  });
  const etikett = (text: string) => <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>{text}</p>;

  return (
    <Ark
      rubrik={redigerar ? 'Ändra ansökan' : 'Ansök om ledighet'}
      onStang={onStang}
      fot={
        <>
          {/* Död knapp utan förklaring förvirrar — säg vad som saknas, i ord */}
          {saknas.length > 0 && <p style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>Välj {saknas.join(' + ')} för att skicka</p>}
          <FelText text={sparfel} />
          <button onClick={spara} disabled={!kanSkicka} style={{ ...KNAPP.primar, ...(kanSkicka ? {} : INAKTIV) }}>
            {sparar ? 'Sparar…' : redigerar ? 'Spara ändring' : 'Skicka ansökan'}
          </button>
        </>
      }
    >
      {/* Typval — bara det som går att ANSÖKA om (tema.ANSOKBARA_TYPER); TYPINFO
          täcker alla nio typer i tabellen men sjuk/vab anmäls i morgonkortet. */}
      {etikett('Typ')}
      <div style={{ display: 'flex', gap: AVSTAND.s }}>
        {ANSOKBARA_TYPER.map(v => {
          const aktiv = typ === v;
          return (
            <button key={v} onClick={() => valjTyp(v)} aria-pressed={aktiv} style={{ ...val(aktiv), padding: `0 ${AVSTAND.s}px`, whiteSpace: 'nowrap' }}>
              {aktiv && <Ikon namn="check" />}{TYPKORT[v] ?? TYPINFO[v].label}
            </button>
          );
        })}
      </div>

      {arByte && (
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
          Du jobbar en röd vardag och är ledig en annan vardag i stället (Skogsavtalet §5 mom 4). Lön enligt schemat, inget avdrag för den lediga dagen. Helglönen flyttas inte.
        </p>
      )}

      {/* Tryck-kalender: tryck startdag, tryck slutdag — spannet fylls i.
          Bytesdag: en dag, slut = start. */}
      {etikett('Period')}
      <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: `${AVSTAND.s}px ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
        <ValjKalender
          valdStart={start}
          valdSlut={arByte ? start : slut}
          onValj={(s, e) => { setStart(s); setSlut(arByte ? s : e); }}
        />
      </div>

      {/* Vald period + arbetsdagar, räknas om medan man trycker */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, minHeight: TRAFFYTA.min, marginTop: AVSTAND.s }}>
        {start ? (
          <div>
            <div style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>
              {arByte ? `Ledig ${fmtPeriod(start, start)}` : fmtPeriod(start, effektivtSlut)}
            </div>
            <div style={{ ...TYP.meta, marginTop: AVSTAND.xs, color: ledigDagFel ? FARG.rod : FARG.text2 }}>
              {ledigDagFel ?? (arByte ? 'en vardag som byts mot den röda dagen nedan' : (() => {
                const ad = arbetsdagar(start, effektivtSlut);
                return `${ad} arbetsdag${ad === 1 ? '' : 'ar'} · helg och röda dagar räknas inte`;
              })())}
            </div>
          </div>
        ) : (
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{arByte ? 'Tryck på den vardag du vill vara ledig' : 'Tryck på en dag i kalendern för att välja period'}</div>
        )}
        {start && (
          <button type="button" onClick={() => { setStart(null); setSlut(null); }} style={{ ...KNAPP.tertiar, ...KORT_TEXTKNAPP }}>Rensa</button>
        )}
      </div>

      {/* Bytesdag: vilken röd vardag som arbetas i stället — bara ur lib/roda-dagar */}
      {arByte && (
        <>
          {etikett('Ersätter röd dag')}
          {rodaVal.length === 0 ? (
            <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Ingen röd vardag inom ett halvår som inte redan är bytt.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {rodaVal.map(r => {
                const aktiv = ersatter === r.datum;
                return (
                  <button key={r.datum} type="button" onClick={() => setErsatter(r.datum)} aria-pressed={aktiv}
                    style={{ ...val(aktiv), flex: 'none', width: '100%', justifyContent: 'space-between', ...TYP.text, fontWeight: aktiv ? VIKT.halvfet : VIKT.normal }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>{aktiv && <Ikon namn="check" />}{r.namn}</span>
                    <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{fmtDatum(r.datum)} {r.datum.slice(0, 4)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {etikett('Kommentar (valfritt)')}
      <textarea placeholder="Valfritt…" value={kommentar} onChange={e => setKommentar(e.target.value)} rows={2}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.primar * 2, padding: `${AVSTAND.m}px`, background: FARG.upphojt, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', resize: 'none', colorScheme: 'dark' }} />

      {/* Blockerande: egen godkänd ledighet i intervallet. Ord i rött — ingen färgad ruta. */}
      {dubbelbokning && <div style={{ marginTop: AVSTAND.m }}><FelText text={dubbelbokning} /></div>}

      {/* Icke-blockerande: andras godkända ledighet samma datum (kollision) */}
      {!dubbelbokning && kollision.length > 0 && (
        <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>
          <span style={{ fontWeight: VIKT.halvfet }}>Krock</span> — {kollision.join(' och ')} har godkänd ledighet under dessa datum. Du kan ändå ansöka.
        </p>
      )}
    </Ark>
  );
}
