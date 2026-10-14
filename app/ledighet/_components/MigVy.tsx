'use client';

import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { raderaVerifierat } from '@/lib/supabase-save';
import type { CurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { AVSTAND, FARG, INAKTIV, KNAPP, KORT, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { toISO } from './datum';
import { useLedighetData } from './useLedighetData';
import { useNyaBeslut } from './useNyaBeslut';
import type { Ansokan } from './typer';
import SaldoKort from './SaldoKort';
import AnsokanRad from './AnsokanRad';
import AnsokFormular from './AnsokFormular';
import GodkannSektion from './GodkannSektion';
import { FelText, Grupp, Ikon, LasFel, StatusText } from './delar';

/**
 * "Mig" — inloggad person är alltid "jag" (scopat på medarbetare.id från
 * auth-kontexten). Ingen personväljare. Saldon läses lagrade ur
 * medarbetare_saldo; ansökningar filtreras på egen medarbetare_id.
 */
export default function MigVy({ medarbetare }: { medarbetare: CurrentMedarbetare }) {
  const { saldo, saldoSaknas, saldoLasfel, ansokningar, laddar, lasfel, hamtaOm } = useLedighetData(medarbetare.id);
  const [formOppen, setFormOppen] = useState(false);
  const [redigerar, setRedigerar] = useState<Ansokan | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [historikOppen, setHistorikOppen] = useState(false);

  const arGodkannare = medarbetare.roll === 'admin';
  const idag = toISO(new Date());
  // Ansök kräver att ansökningarna ÄR lästa: dubbelbokning och krock jämförs mot dem.
  // Medan de läses, eller när läsningen felade, är listan tom (eller gammal) — då
  // skulle en överlappande ansökan godkännas utan varning.
  const kanAnsoka = !laddar && !lasfel;
  // Push-notisen till en godkännare öppnar vyn med "att godkänna" uppfälld.
  const [godkannOppen] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('godkann') === '1',
  );
  // Nya beslut jag inte sett: visas överst och kvitteras först när de lästs och visats.
  const nyaIds = useNyaBeslut(kanAnsoka);

  const mina = useMemo(
    () => ansokningar.filter(a => a.medarbetare_id === medarbetare.id),
    [ansokningar, medarbetare.id],
  );
  // Ett nytt beslut står BARA under "Nytt besked" (inte också i Kommande/Historik) tills det setts.
  const nyaBesked = useMemo(
    () => mina.filter(a => nyaIds.includes(a.id)),
    [mina, nyaIds],
  );
  // Tre grupper efter TID, inte bara status: en beviljad ledighet flyttar
  // till Historik när den PASSERAT (slutdatum < idag), inte när den godkänns.
  const vantarPaBesked = useMemo(
    () => mina.filter(a => a.status === 'väntar' && a.slutdatum >= idag && !nyaIds.includes(a.id))
      .sort((a, b) => a.startdatum.localeCompare(b.startdatum)),
    [mina, idag, nyaIds],
  );
  // 'registrerad' = anmäld i morgonkortet (sjuk/vab/föräldraledig) — gäller som godkänd
  const kommandeLedighet = useMemo(
    () => mina.filter(a => (a.status === 'godkänd' || a.status === 'registrerad') && a.slutdatum >= idag && !nyaIds.includes(a.id))
      .sort((a, b) => a.startdatum.localeCompare(b.startdatum)),
    [mina, idag, nyaIds],
  );
  // Passerat (oavsett status) + avslag (beskedet är avklarat oavsett datum)
  const historik = useMemo(
    () => mina.filter(a => (a.slutdatum < idag || a.status === 'nekad') && !nyaIds.includes(a.id)),
    [mina, idag, nyaIds],
  );
  const vantandeAlla = useMemo(
    () => ansokningar.filter(a => a.status === 'väntar'),
    [ansokningar],
  );

  // Bekräftelsen ("Ta bort ansökan? Nej / Ja, ta bort") sker i raden (AnsokanRad) —
  // hit kommer vi först när föraren sagt ja.
  const taBort = async (a: Ansokan) => {
    setFel(null);
    const res = await raderaVerifierat(supabase, 'ledighet_ansokningar', {
      id: a.id, medarbetare_id: medarbetare.id,
    });
    if (!res.ok) {
      setFel(res.fel);
      return;
    }
    hamtaOm();
  };

  const rader = (lista: Ansokan[], extra: { tidigare?: boolean; redigera?: boolean }) => lista.map((a, i) => (
    <AnsokanRad key={a.id} a={a} arEgen tidigare={extra.tidigare} sista={i === lista.length - 1}
      onRedigera={extra.redigera ? (x => { setRedigerar(x); setFormOppen(true); }) : undefined}
      onTaBort={a.status === 'väntar' ? taBort : undefined} />
  ));

  return (
    <div>
      {arGodkannare && !lasfel && (
        <GodkannSektion vantande={vantandeAlla} onKlar={hamtaOm} startOppen={godkannOppen} />
      )}

      <div style={{ marginBottom: AVSTAND.l }}>
        <SaldoKort saldo={saldo} saldoSaknas={saldoSaknas} saldoLasfel={saldoLasfel} onForsok={hamtaOm} />
      </div>

      {/* Vyns EN primära handling: stor, helbredd, under saldot. Spärrad (men synlig) tills
          ansökningarna är lästa — krock och dubbelbokning jämförs mot dem. */}
      <button disabled={!kanAnsoka} onClick={() => { setFel(null); setRedigerar(null); setFormOppen(true); }}
        style={{ ...KNAPP.primar, ...(kanAnsoka ? {} : INAKTIV) }}>
        <Ikon namn="add" storlek={22} />Ansök om ledighet
      </button>

      {/* Fel vid en åtgärd i listan (Ta bort) står direkt ovanför listan, kvar tills man gjort något nytt */}
      {fel && <div style={{ marginTop: AVSTAND.l }}><FelText text={fel} /></div>}

      <div style={{ marginTop: AVSTAND.xl }}>
        {lasfel ? (
          <LasFel text={lasfel} onForsok={hamtaOm} />
        ) : laddar ? (
          <StatusText text="Läser dina ansökningar…" />
        ) : (
          <>
            {/* 0. Nytt besked — beslut jag inte sett (godkänd/nekad). Pricken på hemskärmen pekar hit. */}
            {nyaBesked.length > 0 && (
              <Grupp rubrik="Nytt besked">{rader(nyaBesked, {})}</Grupp>
            )}

            {/* 1. Väntar på besked — kan ändras/tas bort */}
            {vantarPaBesked.length > 0 && (
              <Grupp rubrik="Väntar på besked">{rader(vantarPaBesked, { redigera: true })}</Grupp>
            )}

            {/* 2. Kommande ledighet — beviljad, ej passerad; låst men synlig */}
            {kommandeLedighet.length > 0 && (
              <Grupp rubrik="Kommande ledighet">{rader(kommandeLedighet, {})}</Grupp>
            )}

            {/* 3. Historik — passerat (och avslag); hopfälld så den inte tar plats */}
            {historik.length > 0 && (
              <section>
                <button onClick={() => setHistorikOppen(!historikOppen)} aria-expanded={historikOppen}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.xs}px`, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...TYP.micro, color: FARG.text2 }}>
                  <span>Historik ({historik.length})</span>
                  <Ikon namn="chevron_right" storlek={22} farg={FARG.text3} vrid={historikOppen} />
                </button>
                {historikOppen && (
                  <div className="tona-in" style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>{rader(historik, { tidigare: true })}</div>
                )}
              </section>
            )}

            {nyaBesked.length === 0 && vantarPaBesked.length === 0 && kommandeLedighet.length === 0 && historik.length === 0 && (
              <StatusText text={'Inga ansökningar ännu. Tryck "Ansök om ledighet" för att skapa din första.'} />
            )}
          </>
        )}
      </div>

      {formOppen && (
        <AnsokFormular
          redigerar={redigerar}
          egenId={medarbetare.id}
          egenNamn={medarbetare.namn}
          ansokningar={ansokningar}
          onStang={() => { setFormOppen(false); setRedigerar(null); }}
          onSparad={() => { setFormOppen(false); setRedigerar(null); hamtaOm(); }}
        />
      )}
    </div>
  );
}
