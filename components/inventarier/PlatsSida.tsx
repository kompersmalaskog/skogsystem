'use client';

// /inventarier/plats/<id> — vad som finns på EN plats (hallen, Stefans bil, Wisents depåskåp, LBC Ryd).
//
// Överst platsens namn och "Senast kollad 14 sep av Stefan" med Stämmer: den som gått igenom platsen trycker, och
// en gammal lista syns som gammal i stället för att låtsas stämma. Under: raderna, grupperade på hylla när det finns
// hyllor. Längst ned: Lägg till.

import { useCallback, useMemo, useState } from 'react';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, INAKTIV, KNAPP, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { platsKollad } from '@/lib/inventarier/data';
import type { VisadRad } from '@/lib/inventarier/typer';
import { antalText, artikelTitel, hyllGrupper, kolladText, maskinNamn, tomText, visadeRader } from '@/lib/inventarier/vy';
import { ArkFel, FelLage, InvVy, Laddar, Tillbaka } from './delar';
import Kvitto from './Kvitto';
import LaggTillArk from './LaggTillArk';
import RadArk from './RadArk';
import { useInventarier } from './useInventarier';

type Oppet = { ark: 'rad'; radId: string } | { ark: 'laggTill' } | null;

export default function PlatsSida({ platsId }: { platsId: string }) {
  const { state, lasOm, forsokIgen } = useInventarier();
  const [oppet, setOppet] = useState<Oppet>(null);
  const [kvitto, setKvitto] = useState<string | null>(null);
  const [kollar, setKollar] = useState(false);
  const [kollFel, setKollFel] = useState<string | null>(null);

  const inv = state.lage === 'klar' ? state.inv : null;
  const plats = inv?.platser.find(p => p.id === platsId) ?? null;
  const rader = useMemo(() => (inv ? visadeRader(inv).filter(v => v.plats.id === platsId) : []), [inv, platsId]);
  const grupper = useMemo(() => (plats ? hyllGrupper(rader, plats.typ) : []), [rader, plats]);

  const klar = useCallback((text: string) => {
    setOppet(null);
    setKvitto(text);
    lasOm();
  }, [lasOm]);
  const kvittoBorta = useCallback(() => setKvitto(null), []);

  async function korStammer() {
    setKollar(true); setKollFel(null);
    const s = await platsKollad(platsId);
    setKollar(false);
    if (!s.ok) { setKollFel(s.fel); return; }
    setKvitto(`${plats?.namn ?? 'Platsen'} stämmer`);
    lasOm();
  }

  const oppetRad: VisadRad | null = oppet?.ark === 'rad' ? rader.find(v => v.rad.id === oppet.radId) ?? null : null;
  const skotare = plats?.maskin_id ? inv?.maskiner.find(m => m.maskin_id === plats.maskin_id) ?? null : null;
  const av = plats?.senast_kollad_av ? inv?.personer.find(p => p.id === plats.senast_kollad_av)?.namn ?? null : null;
  const kollad = plats ? kolladText(plats, av) : null;

  return (
    <InvVy>
      <Tillbaka href="/inventarier" text="Inventarier" />
      {state.lage === 'laddar' && <Laddar text="Läser platsen…" />}
      {state.lage === 'fel' && <FelLage fel={state.fel} onForsok={forsokIgen} />}
      {inv && !plats && (
        <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xl}px 0` }}>Platsen finns inte längre.</p>
      )}

      {inv && plats && (
        <>
          <h1 style={{ ...TYP.titel, color: FARG.text, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>{plats.namn}</h1>
          {skotare && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Följer {maskinNamn(skotare)}</p>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
            <span data-testid="kollad" style={{ ...TYP.meta, color: kollad?.gammal ? FARG.orange : FARG.text2 }}>{kollad?.text}</span>
            <button type="button" onClick={korStammer} data-testid="stammer"
              style={{ ...KNAPP.sekundar, width: 'auto', flexShrink: 0, ...(kollar ? INAKTIV : null) }}>
              Stämmer
            </button>
          </div>
          <ArkFel fel={kollFel} />

          {grupper.length === 0 ? (
            <p data-testid="tom" style={{ ...TYP.text, color: FARG.text2, margin: `0 0 ${AVSTAND.xl}px` }}>{tomText(plats)}</p>
          ) : grupper.map(g => (
            <Sektion key={g.rubrik} rubrik={g.rubrik}>
              {g.rader.map((v, i) => {
                const forbrukning = v.artikel.typ === 'forbrukning';
                const under = [maskinNamn(v.maskin), forbrukning && v.rad.min_antal != null ? `min ${v.rad.min_antal}` : null]
                  .filter(Boolean).join(' · ');
                return (
                  <Rad key={v.rad.id}
                    titel={artikelTitel(v.artikel)}
                    under={under || undefined}
                    hoger={forbrukning ? antalText(v.rad.antal ?? 0, v.artikel.enhet) : undefined}
                    onTryck={() => setOppet({ ark: 'rad', radId: v.rad.id })}
                    sista={i === g.rader.length - 1}
                    attr={{ 'data-rad': v.rad.id }} />
                );
              })}
            </Sektion>
          ))}

          <button type="button" style={KNAPP.sekundar} onClick={() => setOppet({ ark: 'laggTill' })} data-testid="lagg-till-knapp">
            Lägg till
          </button>

          {oppetRad && (
            <RadArk v={oppetRad} platser={inv.platser} maskiner={inv.maskiner} artiklar={inv.artiklar}
              andraPlatser={inv.rader.filter(r => r.artikel_id === oppetRad.artikel.id && r.id !== oppetRad.rad.id).length}
              onStang={() => setOppet(null)} onKlar={klar} />
          )}
          {oppet?.ark === 'laggTill' && (
            <LaggTillArk inv={inv} platsId={plats.id} onStang={() => setOppet(null)} onKlar={klar} />
          )}
        </>
      )}

      <Kvitto text={kvitto} onBorta={kvittoBorta} />
    </InvVy>
  );
}
