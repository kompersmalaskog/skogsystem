'use client';

// "Skotare utifrån" i objektets ⓘ-kort (planeringsläget, bara riktig admin): länken till skotarsidan /skotare/<token> för en EXTERN skotare,
// t.ex. markägarens egen som skotar efter vår skördare. Kopiera länken, visa sidan som skotaren ser den, slå länken på/av.
// Länken SKAPAS först när planeraren öppnar den här vyn (inte för varje objekt man tittar på) och slutar gälla när trakten är avslutad.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import { Gruppkort, RadKnapp, Rubrik } from '@/components/planering/infoDelar';
import { skotarUrl } from '@/lib/skotarlank/offentlig';
import { kopieraText } from '@/components/besok/BesokPlanerare';

export interface SkotarLankPlanerareProps {
  objektId: string;
  status: string | null;
  /** Bara för test. Standard: adressen appen körs på, ett nytt fönster och urklipp. */
  origin?: string;
  oppnaSida?: (url: string) => void;
  kopiera?: (text: string) => Promise<void>;
}

type Lank = { token: string; aktiv: boolean };
const saknasFunktion = (m?: string | null) => /skotar_lank|does not exist|schema cache|PGRST202|42883/i.test(m ?? '');

export function useSkotarLank(objektId: string, skapa: boolean) {
  const [lank, setLank] = useState<Lank | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [saknas, setSaknas] = useState(false);
  const objRef = useRef(objektId);
  objRef.current = objektId;
  useEffect(() => {
    setLank(null); setFel(null); setSaknas(false);
    if (!skapa) return;
    let avbruten = false;
    supabase.rpc('skotar_lank_hamta', { p_objekt: objektId }).then((r) => {
      if (avbruten) return;
      const rad = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!r.error && rad?.token) setLank({ token: String(rad.token), aktiv: !!rad.aktiv });
      else if (saknasFunktion(r.error?.message)) setSaknas(true);
      else setFel(r.error?.message ?? 'okänt fel');
    });
    return () => { avbruten = true; };
  }, [objektId, skapa]);
  const sattAktiv = useCallback(async (aktiv: boolean): Promise<boolean> => {
    const id = objRef.current;
    const r = await supabase.rpc('skotar_lank_satt_aktiv', { p_objekt: id, p_aktiv: aktiv });
    if (r.error || objRef.current !== id) return false;
    setLank((l) => (l ? { ...l, aktiv } : l));
    return true;
  }, []);
  return { lank, fel, saknas, sattAktiv };
}

export default function SkotarLankPlanerare(p: SkotarLankPlanerareProps) {
  const avslutat = p.status === 'avslutat' || p.status === 'klar';
  const d = useSkotarLank(p.objektId, !avslutat);
  const [meddelande, setMeddelande] = useState<string | null>(null);
  const url = d.lank ? skotarUrl(p.origin ?? window.location.origin, d.lank.token) : null;
  const klar = !!url && !!d.lank?.aktiv && !avslutat;

  if (d.saknas) {
    return <div data-testid="skotarlank-migrering" style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: AVSTAND.l, ...TYP.text, color: FARG.orange }}>Skotarlänken är inte aktiverad i databasen än.</div>;
  }

  const kopiera = () => {
    setMeddelande(null);
    if (!klar || !url) { setMeddelande(avslutat ? 'Trakten är avslutad — länken gäller inte längre.' : !d.lank ? 'Länken är inte klar än.' : 'Länken är avstängd — slå på den först.'); return; }
    (p.kopiera ?? kopieraText)(url).then(() => setMeddelande('Kopierat — klistra in länken i ett SMS eller mejl till skotaren.'), () => setMeddelande('Kunde inte kopiera — försök igen.'));
  };

  return (
    <div data-testid="kort-skotarlank">
      <Rubrik>Länk till skotaren</Rubrik>
      <Gruppkort>
        <RadKnapp forstaRad testid="skotarlank-kopiera" ikon="content_copy" etikett="Kopiera länken"
          under={avslutat ? 'Trakten är avslutad' : !d.lank ? (d.fel ? 'Kunde inte skapa länken' : 'Förbereder länken …') : d.lank.aktiv ? 'Skicka den till skotaren' : 'Länken är avstängd'}
          onTryck={kopiera} />
        <RadKnapp testid="skotarlank-visa" ikon="open_in_new" etikett="Visa som skotaren" under="Öppnar sidan skotaren ser"
          onTryck={() => { if (url && !avslutat) (p.oppnaSida ?? ((u: string) => { window.open(u, '_blank', 'noopener'); }))(url); }} />
        <RadKnapp testid="skotarlank-av-pa" ikon="link" etikett="Länken" pil={false}
          hoger={<span data-testid="skotarlank-lage" style={{ ...TYP.listtitel, color: d.lank?.aktiv && !avslutat ? FARG.gron : FARG.text2 }}>{avslutat ? 'Gäller inte' : d.lank ? (d.lank.aktiv ? 'På' : 'Av') : '…'}</span>}
          onTryck={async () => { if (!d.lank || avslutat) return; setMeddelande(null); if (!(await d.sattAktiv(!d.lank.aktiv))) setMeddelande('Kunde inte ändra länken just nu.'); }} />
      </Gruppkort>
      <p style={{ margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: FARG.text2 }}>
        Skotaren ser bara den här trakten: gränsen, skördarens körspår, högarna och det du satt ut. Inga namn, priser eller andra trakter. Ingen inloggning — den som har länken ser sidan. Länken slutar gälla när trakten är avslutad.
      </p>
      {meddelande && <div role="status" style={{ ...TYP.meta, color: FARG.text, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>{meddelande}</div>}
      {d.fel && <div role="alert" style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>Kunde inte skapa länken. Försök igen om en stund.</div>}
    </div>
  );
}
