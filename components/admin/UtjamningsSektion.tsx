"use client";
// ─────────────────────────────────────────────────────────────
// Admin → Avtal → Utjämningsperioder. Veckor där ordinarie tid lades ut ojämnt (§5 mom 2): årsövertiden räknar
// genomsnittet över hela perioden. Förr bara via SQL. Hela ISO-veckor, så formuläret erbjuder bara måndagar.
//
// EN period = EN rad i listan: databasrader med samma namn, start och slut (en per förare, eller en för Alla) grupperas.
// Arket (PeriodArk) ändrar och tar bort hela gruppen.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { veckoText, delaUpp, grupperaPerioder, overenskommelseRad, type PeriodGrupp, type PeriodRad } from "@/lib/admin/utjamningsperiod";
import { Sektion, Kort, Lista, Rad, Sekundar, Fel, Laddar, Tomt, Etikett } from "./ui";
import PeriodArk, { type Arbete, type Person } from "./PeriodArk";

const kortDatum = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
};

export default function UtjamningsSektion({ namnInloggad }: { namnInloggad: string }) {
  const [rader, setRader] = useState<PeriodRad[] | null>(null);
  const [personer, setPersoner] = useState<Person[]>([]);
  const [fel, setFel] = useState<string | null>(null);
  const [arbete, setArbete] = useState<Arbete | null>(null);

  const ladda = useCallback(async () => {
    setFel(null);
    const [p, m] = await Promise.all([
      supabase.from("utjamningsperiod").select("id, namn, startdatum, slutdatum, medarbetare_id, anteckning, overenskommen_datum, skapad_av").order("startdatum", { ascending: true }),
      supabase.from("medarbetare").select("id, namn").order("namn", { ascending: true }),
    ]);
    const e = p.error || m.error;
    if (e) { setFel(e.message || String(e)); setRader(null); return; }
    setRader((p.data || []) as PeriodRad[]);
    setPersoner((m.data || []) as Person[]);
  }, []);
  useEffect(() => { ladda(); }, [ladda]);

  const idag = ymdLokal(new Date());
  const grupper = useMemo(() => grupperaPerioder(rader || []), [rader]);
  const { kommande, avslutade } = useMemo(() => delaUpp(grupper, idag), [grupper, idag]);

  /** Förarna i en grupp som text: 'Alla, Anna, Erik' — förnamn, i förarlistans ordning. */
  const forareLista = (g: PeriodGrupp) => {
    const personNamn = personer.filter(p => g.forare.includes(p.id)).map(p => (p.namn || "Namnlös").split(" ")[0]);
    const okanda = g.forare.filter(id => !personer.some(p => p.id === id)).map(() => "Okänd");
    return [...(g.alla ? ["Alla"] : []), ...personNamn, ...okanda].join(", ") || "—";
  };

  const radUI = (g: PeriodGrupp, sista: boolean) => {
    // Skogsavtalet §5 mom 2: högst 16 veckor kräver ingen överenskommelse (då ingen rad om det); över 16 veckor krävs en med lokal facklig organisation.
    const overenskommelse = overenskommelseRad(g);
    return (
    <div key={g.nyckel} data-utjamning-rad={g.namn}>
      <Rad sista={sista} onClick={() => setArbete({ slag: "redigera", grupp: g })} chevron
        rubrik={<span style={{ display: "inline-flex", alignItems: "center", gap: AVSTAND.s }}>{g.namn}{g.startdatum <= idag && g.slutdatum >= idag && <Etikett>Pågår</Etikett>}</span>}
        detalj={(
          <>
            <div>{veckoText(g)} · {kortDatum(g.startdatum)}–{kortDatum(g.slutdatum)}</div>
            <div>{forareLista(g)}</div>
            {overenskommelse && <div style={{ color: overenskommelse.orange ? FARG.orange : FARG.text2 }}>{overenskommelse.text}</div>}
          </>
        )} />
    </div>
    );
  };

  return (
    <div data-utjamning>
      <Sektion>Utjämningsperioder</Sektion>
      {fel ? (
        <Fel onForsok={ladda}>Kunde inte läsa utjämningsperioderna: {fel}</Fel>
      ) : rader === null ? (
        <Laddar>Laddar utjämningsperioder…</Laddar>
      ) : (
        <>
          {grupper.length === 0 ? (
            <Kort><Tomt>Inga utjämningsperioder. En period markerar veckor där ordinarie tid lades ut ojämnt, så att årsövertiden räknar genomsnittet över hela perioden. Tryck Ny period för att lägga till en.</Tomt></Kort>
          ) : (
            <>
              {kommande.length > 0 && <Lista>{kommande.map((g, i) => radUI(g, i === kommande.length - 1))}</Lista>}
              {avslutade.length > 0 && (
                <>
                  <div style={{ ...TYP.micro, color: FARG.text3, margin: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, padding: `0 ${AVSTAND.xs}px` }}>Avslutade</div>
                  <Lista>{avslutade.map((g, i) => radUI(g, i === avslutade.length - 1))}</Lista>
                </>
              )}
            </>
          )}
          <Sekundar onClick={() => setArbete({ slag: "ny" })} style={{ marginTop: AVSTAND.l }}>Ny period</Sekundar>
        </>
      )}

      {arbete && (
        <PeriodArk
          arbete={arbete} personer={personer} befintliga={rader || []} namnInloggad={namnInloggad}
          onStang={() => setArbete(null)}
          onKlar={() => { setArbete(null); ladda(); }}
          omladda={ladda} />
      )}
    </div>
  );
}
