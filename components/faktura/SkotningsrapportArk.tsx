'use client';

// Skotningsrapporten: förhandsvisning och Dela (2026-11-25).
//
// Talen kommer ur FAKTURANS underlag — samma `avstand` som trakten visar och
// som fakturan räknar på. Kartan läses per trakt när knappen trycks
// (traktgräns, stammar, skotarens körspår, avlägg); det är en stor läsning och
// hör inte i sidladdningen.
//
// En del som inte gick att läsa sägs i klartext och rapporten görs ändå —
// ingen tyst halv karta. Går INGET att läsa blir det ingen PDF.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PdfForhandsvisning from '@/app/helikopter/_components/PdfForhandsvisning';
import { avstandMeter } from '@/lib/faktura/granskningVy';
import type { Granskningsunderlag } from '@/lib/faktura/hamtaUnderlag';
import { markSlagen } from '@/lib/faktura/rapportMark';
import type { RapportUnderlag } from '@/lib/faktura/lasSkotningsrapport';
import { AVSTAND, FARG, KNAPP, KORT, TYP } from '@/lib/design/tokens';

type Trakt = {
  vo_nummer: string;
  objektnamn: string;
  bolag: string | null;
  avtalsform: string;
  objekt_ids: string[];
  granskning: Granskningsunderlag | null;
};

export default function SkotningsrapportArk({ d, onStang }: { d: Trakt; onStang: () => void }) {
  const [underlag, setUnderlag] = useState<RapportUnderlag | null>(null);
  const [fel, setFel] = useState<string | null>(null);

  const las = useCallback(async () => {
    setFel(null);
    setUnderlag(null);
    try {
      const { data, error } = await supabase
        .from('objekt').select('id').eq('vo_nummer', d.vo_nummer).maybeSingle();
      if (error) { setFel('Trakten kunde inte läsas: ' + error.message); return; }
      if (!data?.id) { setFel('Trakten finns inte som objekt i appen, så kartan kan inte ritas.'); return; }
      const { lasSkotningsrapport } = await import('@/lib/faktura/lasSkotningsrapport');
      setUnderlag(await lasSkotningsrapport(supabase, {
        objektUuid: data.id as string,
        nummer: [d.vo_nummer, ...d.objekt_ids],
      }));
    } catch (e) {
      setFel(e instanceof Error ? e.message : 'Kartan kunde inte läsas.');
    }
  }, [d.vo_nummer, d.objekt_ids]);

  useEffect(() => { void las(); }, [las]);

  if (fel) {
    return (
      <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
        <p style={{ margin: 0, ...TYP.listtitel, color: FARG.orange }}>Rapporten kunde inte göras</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{fel}</p>
        <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
          <button type="button" onClick={() => void las()} style={KNAPP.sekundar}>Försök igen</button>
          <button type="button" onClick={onStang} style={KNAPP.lank}>Stäng</button>
        </div>
      </div>
    );
  }

  if (!underlag) {
    return (
      <p style={{ ...TYP.text, color: FARG.text2, margin: `0 0 ${AVSTAND.l}px ${AVSTAND.xs}px` }}>
        Läser kartan och lassen …
      </p>
    );
  }

  const g = d.granskning!;

  return (
    <>
      {underlag.fel.length > 0 && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.orange }}>
          {underlag.fel.join(' ')}
        </p>
      )}
      <PdfForhandsvisning
        skapa={async () => {
          const [{ skotningsrapport }, { skapaSkotningsrapportPdf }] = await Promise.all([
            import('@/lib/faktura/skotningsrapport'),
            import('@/lib/faktura/skotningsrapportPdf'),
          ]);
          return skapaSkotningsrapportPdf(skotningsrapport({
            trakt: {
              namn: d.objektnamn,
              voNummer: d.vo_nummer,
              kund: d.bolag,
              avtalsform: d.avtalsform,
            },
            skotare: underlag.skotare,
            period: underlag.period,
            dagar: underlag.dagar,
            volymM3fub: g.volym,
            avstandM: avstandMeter(g.avstand),
            handsatt: g.avstand.manuellt != null,
            cykel: g.avstand.cykel,
            lass: g.avstand.lass,
            // Virket och avläggen bär "Var låg virket?". Avläggen kommer ur
            // kartans läsning (Vidas tilläggspunkter) — samma punkter som
            // ritas, så tabellen mäter från det inköparen ser på kartan.
            virke: underlag.virke,
            avlagg: underlag.karta.avlagg.map(a => ({ ...a.plats, namn: a.namn })),
            // Teckenförklaringen får bara nämna det som ritas — hänsynen och
            // marken kommer därför ur kartans egen läsning, inte ur en lista.
            kartinnehall: {
              zoner: (underlag.karta.markeringar ?? [])
                .filter(m => m.slag === 'zon').map(m => m.typ),
              symboler: (underlag.karta.markeringar ?? [])
                .filter(m => m.slag === 'symbol').map(m => m.typ),
              mark: markSlagen(underlag.karta.mark ?? []),
            },
            pris: {
              grundavstandM: g.avstand.grundavstandM,
              krPer100m: g.avstand.krPer100m,
              kronor: g.avstand.kronor,
            },
          }), underlag.karta);
        }}
        filnamn={`skotningsrapport-${d.vo_nummer}`}
        titel="Skotningsrapport"
        onStang={onStang}
      />
    </>
  );
}
