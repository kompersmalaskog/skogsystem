'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { raderaVerifierat } from '@/lib/supabase-save';
import type { CurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { AVSTAND, FARG, INAKTIV, KNAPP, KORT, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { toISO } from './datum';
import { useLedighetData } from './useLedighetData';
import { useNyaBeslut } from './useNyaBeslut';
import { INGEN_FOKUS, MARKERING_MS, lasFokus } from './fokus';
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
  // Länken ur en push-notis pekar på EN ansökan (?besked=<id> / ?godkann=<id>): vyn landar PÅ den (fokus.ts).
  const [fokus] = useState(() => (typeof window === 'undefined' ? INGEN_FOKUS : lasFokus(window.location.search)));
  // Nya beslut jag inte sett: visas överst och kvitteras först när de lästs och visats.
  const nyaIds = useNyaBeslut(kanAnsoka);

  const mina = useMemo(
    () => ansokningar.filter(a => a.medarbetare_id === medarbetare.id),
    [ansokningar, medarbetare.id],
  );
  // Toppgruppen: ansökan som notisen pekade på FÖRST (även om beslutet redan setts — då ligger det annars gömt i
  // Kommande eller den hopfällda Historiken), sedan beslut jag inte sett. Står bara här, aldrig också längre ned.
  const fokusRad = useMemo(
    () => (fokus.besked ? mina.find(a => a.id === fokus.besked) : undefined),
    [mina, fokus.besked],
  );
  const toppRader = useMemo(() => {
    const ordning = [fokusRad?.id, ...nyaIds].filter((x): x is string => !!x);
    return Array.from(new Set(ordning)).map(id => mina.find(a => a.id === id)).filter((a): a is Ansokan => !!a);
  }, [mina, nyaIds, fokusRad]);
  const toppIds = useMemo(() => new Set(toppRader.map(a => a.id)), [toppRader]);
  // "Nytt besked" bara om allt i gruppen faktiskt är nytt; ett redan sett besked som notisen pekar på heter "Besked".
  const toppRubrik = toppRader.every(a => nyaIds.includes(a.id)) ? 'Nytt besked' : 'Besked';
  // Tre grupper efter TID, inte bara status: en beviljad ledighet flyttar
  // till Historik när den PASSERAT (slutdatum < idag), inte när den godkänns.
  const vantarPaBesked = useMemo(
    () => mina.filter(a => a.status === 'väntar' && a.slutdatum >= idag && !toppIds.has(a.id))
      .sort((a, b) => a.startdatum.localeCompare(b.startdatum)),
    [mina, idag, toppIds],
  );
  // 'registrerad' = anmäld i morgonkortet (sjuk/vab/föräldraledig) — gäller som godkänd
  const kommandeLedighet = useMemo(
    () => mina.filter(a => (a.status === 'godkänd' || a.status === 'registrerad') && a.slutdatum >= idag && !toppIds.has(a.id))
      .sort((a, b) => a.startdatum.localeCompare(b.startdatum)),
    [mina, idag, toppIds],
  );
  // Passerat (oavsett status) + avslag (beskedet är avklarat oavsett datum)
  const historik = useMemo(
    () => mina.filter(a => (a.slutdatum < idag || a.status === 'nekad') && !toppIds.has(a.id)),
    [mina, idag, toppIds],
  );
  const vantandeAlla = useMemo(
    () => ansokningar.filter(a => a.status === 'väntar'),
    [ansokningar],
  );

  // Mål för scroll + markering. Bara när ansökningarna är lästa utan fel och raden FINNS (ingen gissning).
  const malDomId = !fokus.besked && !fokus.godkannId ? null
    : fokus.besked ? (fokusRad ? `ansokan-${fokus.besked}` : null)
    : (arGodkannare && vantandeAlla.some(a => a.id === fokus.godkannId) ? `godkann-${fokus.godkannId}` : null);
  // Pekar länken på en ansökan som inte finns kvar / redan är hanterad: SÄG det i stället för att landa utan förklaring.
  const notering = laddar || lasfel ? null
    : fokus.besked && !fokusRad ? 'Den ansökan finns inte längre.'
    : fokus.godkannId && arGodkannare && !malDomId ? 'Den ansökan är redan hanterad.'
    : null;

  const [markerad, setMarkerad] = useState<string | null>(null);
  const harFokuserat = useRef(false);
  useEffect(() => {
    if (harFokuserat.current || laddar || lasfel || !malDomId) return;
    const el = document.getElementById(malDomId);
    if (!el) return; // raden är inte ritad ännu — nästa render försöker igen
    harFokuserat.current = true; // EN gång per besök: en omläsning av listan ska inte dra tillbaka sidan
    const stillRorelse = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'center', behavior: stillRorelse ? 'auto' : 'smooth' });
    setMarkerad(malDomId);
  }, [malDomId, laddar, lasfel, ansokningar]);
  // Markeringen tonar ut efter en stund — den ligger aldrig kvar.
  useEffect(() => {
    if (!markerad) return;
    const t = setTimeout(() => setMarkerad(null), MARKERING_MS);
    return () => clearTimeout(t);
  }, [markerad]);

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
      domId={`ansokan-${a.id}`} markerad={markerad === `ansokan-${a.id}`}
      onRedigera={extra.redigera ? (x => { setRedigerar(x); setFormOppen(true); }) : undefined}
      onTaBort={a.status === 'väntar' ? taBort : undefined} />
  ));

  return (
    <div>
      {notering && <p role="status" style={{ margin: 0, paddingBottom: AVSTAND.l, ...TYP.meta, color: FARG.text2 }}>{notering}</p>}

      {/* Besked jag inte sett (och ansökan en notis pekade på) ÖVERST — inte under saldot och Ansök-knappen,
          där det hamnar under vikningen på en telefon. Pricken på hemskärmen pekar hit. */}
      {!laddar && !lasfel && toppRader.length > 0 && (
        <Grupp rubrik={toppRubrik}>{rader(toppRader, {})}</Grupp>
      )}

      {arGodkannare && !lasfel && (
        <GodkannSektion vantande={vantandeAlla} onKlar={hamtaOm} startOppen={fokus.godkannOppen} markeradDomId={markerad} />
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

            {toppRader.length === 0 && vantarPaBesked.length === 0 && kommandeLedighet.length === 0 && historik.length === 0 && (
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
