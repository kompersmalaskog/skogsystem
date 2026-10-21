'use client';

// /i/<rad_id> — det en QR-kod på en låda öppnar. Ett tryck i kameran, inget mer.
//
//   Två lådor (reservlådan): skanningen ÄR handlingen. Sidan anmäler reservlådan direkt och visar en bekräftelse med
//     Ångra. Funktionen är idempotent: en andra skanning (eller en omladdning) säger "Redan anmäld …" och skickar
//     ingen ny notis.
//   Allt annat (räknas, utrustning): sidan öppnar radens ark i Inventarier (/inventarier?rad=<id>) — Tog 1 eller
//     Flytta är ett tryck där. Ingenting räknas ned av en skanning ensam: en omladdning får aldrig ta ut två.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { reservAngra, reservOppnad, type ReservSvar } from '@/lib/inventarier/data';
import { skanningsLage, etikettText } from '@/lib/inventarier/qr';
import { datumKort, fornamn, visadeRader } from '@/lib/inventarier/vy';
import { FelLage, InvVy, Laddar } from './delar';
import { useInventarier } from './useInventarier';

type Lage =
  | { lage: 'skickar' }
  | { lage: 'klar'; svar: ReservSvar }
  | { lage: 'fel'; fel: string }
  | { lage: 'angrar'; svar: ReservSvar }
  | { lage: 'angrat' };

export default function Skanning({ radId }: { radId: string }) {
  const router = useRouter();
  const { state, forsokIgen } = useInventarier();
  const [lage, setLage] = useState<Lage>({ lage: 'skickar' });
  const [angraFel, setAngraFel] = useState<string | null>(null);
  const skickad = useRef(false);

  const inv = state.lage === 'klar' ? state.inv : null;
  const v = inv ? visadeRader(inv).find(x => x.rad.id === radId) ?? null : null;
  const vad = v ? skanningsLage(v) : null;

  // EN anmälan per sidvisning (React kan köra effekten två gånger i utveckling — refen stoppar den andra).
  useEffect(() => {
    if (!v || vad !== 'reserv' || skickad.current) return;
    skickad.current = true;
    reservOppnad(radId).then(s => setLage(s.ok ? { lage: 'klar', svar: s.varde } : { lage: 'fel', fel: s.fel }));
  }, [v, vad, radId]);

  useEffect(() => {
    if (vad === 'oppna') router.replace(`/inventarier?rad=${encodeURIComponent(radId)}`);
  }, [vad, radId, router]);

  async function angra(svar: ReservSvar) {
    setLage({ lage: 'angrar', svar }); setAngraFel(null);
    const s = await reservAngra(radId, svar.tid);
    if (s.ok && s.varde) { setLage({ lage: 'angrat' }); return; }
    setLage({ lage: 'klar', svar });
    setAngraFel(s.ok ? 'Gick inte att ångra — den hann bli beställd.' : s.fel);
  }

  async function forsokAnmala() {
    setLage({ lage: 'skickar' });
    const s = await reservOppnad(radId);
    setLage(s.ok ? { lage: 'klar', svar: s.varde } : { lage: 'fel', fel: s.fel });
  }

  if (state.lage === 'laddar') return <InvVy><Laddar text="Läser etiketten…" /></InvVy>;
  if (state.lage === 'fel') return <InvVy><FelLage fel={state.fel} onForsok={forsokIgen} /></InvVy>;

  if (!v) {
    return (
      <InvVy>
        <div style={{ margin: `${AVSTAND.xl}px 0` }} data-testid="skanning-saknas">
          <p style={{ ...TYP.rubrik, color: FARG.text, margin: 0 }}>Etiketten pekar inte på något längre</p>
          <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
            Raden är borttagen. Lägg upp den igen i Inventarier och skriv ut en ny etikett.
          </p>
          <button type="button" style={KNAPP.primar} onClick={() => router.push('/inventarier')}>Till Inventarier</button>
        </div>
      </InvVy>
    );
  }

  if (vad === 'oppna') return <InvVy><Laddar text="Öppnar…" /></InvVy>;

  const text = etikettText(v);

  if (lage.lage === 'skickar') return <InvVy><Laddar text="Anmäler reservlådan…" /></InvVy>;

  if (lage.lage === 'fel') {
    return (
      <InvVy>
        <div style={{ margin: `${AVSTAND.xl}px 0` }} data-testid="skanning-fel">
          <p role="alert" style={{ ...TYP.rubrik, color: FARG.text, margin: 0 }}>Det gick inte att anmäla</p>
          <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>{lage.fel}</p>
          <button type="button" style={KNAPP.primar} onClick={forsokAnmala}>Försök igen</button>
        </div>
      </InvVy>
    );
  }

  if (lage.lage === 'angrat') {
    return (
      <InvVy>
        <div style={{ margin: `${AVSTAND.xl}px 0`, textAlign: 'center' }} data-testid="skanning-angrat">
          <p style={{ ...TYP.rubrik, color: FARG.text, margin: 0 }}>Ångrat</p>
          <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>{text.titel} beställs inte.</p>
          <button type="button" style={KNAPP.primar} onClick={() => router.push('/inventarier')}>Klar</button>
        </div>
      </InvVy>
    );
  }

  const { svar } = lage;
  const av = svar.av_namn ? ` av ${fornamn(svar.av_namn)}` : '';
  return (
    <InvVy>
      <div style={{ margin: `${AVSTAND.xl}px 0`, textAlign: 'center' }} data-testid="skanning-klar">
        <Ikon namn="check_circle" storlek={IKON.stor} farg={FARG.gron} fylld />
        <p style={{ ...TYP.titel, color: FARG.text, margin: `${AVSTAND.l}px 0 0` }}>
          {svar.redan ? 'Redan anmäld' : 'Beställs'}
        </p>
        <p style={{ ...TYP.listtitel, color: FARG.text, margin: `${AVSTAND.m}px 0 0` }}>{text.titel}</p>
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{text.plats}</p>
        <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.l}px 0 ${AVSTAND.xl}px` }} data-testid="skanning-besked">
          {svar.redan
            ? `Reservlådan anmäldes ${datumKort(svar.tid)}${av}. Inget nytt skickat.`
            : 'Reservlådan är påbörjad. Den står under Att beställa och den som beställer får en notis.'}
        </p>
        <button type="button" style={KNAPP.primar} onClick={() => router.push('/inventarier')}>Klar</button>
        {!svar.redan && (
          <button type="button" data-testid="skanning-angra" onClick={() => angra(svar)}
            style={{ ...KNAPP.tertiar, marginTop: AVSTAND.m, ...(lage.lage === 'angrar' ? INAKTIV : null) }}>
            {lage.lage === 'angrar' ? 'Ångrar…' : 'Ångra'}
          </button>
        )}
        {angraFel && <p role="alert" style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px 0 0` }}>{angraFel}</p>}
      </div>
    </InvVy>
  );
}
