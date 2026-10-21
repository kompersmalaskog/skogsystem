'use client';

// /inventarier — två frågor, i den ordningen:
//   1. Vad behöver beställas?  ETT tal överst ("3 att beställa"), under det raderna. Beställda ligger kvar dämpade.
//   2. Var finns det?          Sökfältet, alltid synligt. Utan sökning: platserna.
//
// Ingen handling ligger på en rad: tryck på raden öppnar ett ark med EN vit knapp (Arbetsrapportens mönster).
// Pushen "Börjar ta slut" öppnar /inventarier?rad=<id> och landar i radens ark.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Falt from '@/components/design/Falt';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { useRaknaUpp } from '@/lib/design/raknaUpp';
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import type { VisadRad } from '@/lib/inventarier/typer';
import {
  antalAttBestalla, antalText, arUnderMin, artikelTitel, attBestalla, datumKort, kolladText, platsGrupper, sok, underText,
  visadeRader,
} from '@/lib/inventarier/vy';
import BestallArk from './BestallArk';
import { FelLage, InvVy, Laddar } from './delar';
import Kvitto from './Kvitto';
import LaggTillArk from './LaggTillArk';
import NyPlatsArk from './NyPlatsArk';
import RadArk from './RadArk';
import { useInventarier } from './useInventarier';

type Oppet =
  | { ark: 'bestall'; radId: string }
  | { ark: 'rad'; radId: string }
  | { ark: 'laggTill'; namn: string }
  | { ark: 'nyPlats' }
  | null;

export default function InventarierStart() {
  const { state, lasOm, forsokIgen } = useInventarier();
  const { medarbetare } = useCurrentMedarbetare();
  const [fraga, setFraga] = useState('');
  const [oppet, setOppet] = useState<Oppet>(null);
  const [kvitto, setKvitto] = useState<string | null>(null);

  const inv = state.lage === 'klar' ? state.inv : null;
  const rader = useMemo(() => (inv ? visadeRader(inv) : []), [inv]);
  const bestall = useMemo(() => attBestalla(rader), [rader]);
  const antal = antalAttBestalla(rader);
  const visatAntal = useRaknaUpp(antal, 0);
  const traffar = useMemo(() => sok(rader, fraga), [rader, fraga]);
  const harForbrukning = rader.some(v => v.artikel.typ === 'forbrukning');
  const arAdmin = medarbetare?.roll === 'admin';

  // Pushen "Börjar ta slut" → /inventarier?rad=<id>: öppna radens ark EN gång när datan är läst, sedan bort med parametern.
  useEffect(() => {
    if (!inv || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const radId = url.searchParams.get('rad');
    if (!radId) return;
    url.searchParams.delete('rad');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
    const v = rader.find(x => x.rad.id === radId);
    if (!v) { setKvitto('Raden finns inte längre.'); return; }
    setOppet(arUnderMin(v.rad, v.artikel) ? { ark: 'bestall', radId } : { ark: 'rad', radId });
  }, [inv, rader]);

  const klar = useCallback((text: string) => {
    setOppet(null);
    setKvitto(text);
    lasOm();
  }, [lasOm]);
  const kvittoBorta = useCallback(() => setKvitto(null), []);

  const oppetRad: VisadRad | null = oppet && (oppet.ark === 'bestall' || oppet.ark === 'rad')
    ? rader.find(v => v.rad.id === oppet.radId) ?? null : null;

  return (
    <InvVy>
      {state.lage === 'laddar' && <Laddar text="Läser inventarierna…" />}
      {state.lage === 'fel' && <FelLage fel={state.fel} onForsok={forsokIgen} />}

      {inv && (
        <>
          <Tillstand nyckel={antal > 0 ? 'bestall' : 'inget'}>
            {antal > 0 ? (
              <div style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }} data-testid="att-bestalla-tal">
                <div style={{ ...TYP.tal, color: FARG.text }}>{visatAntal}</div>
                <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>att beställa</div>
              </div>
            ) : (
              <Svarsrad rubrik="Inget att beställa"
                rad={harForbrukning ? null : 'Lägg in förbrukningen i hallen, så säger appen till när den börjar ta slut.'} />
            )}
          </Tillstand>

          {bestall.length > 0 && (
            <Sektion rubrik="Att beställa">
              {bestall.map((v, i) => (
                <Rad key={v.rad.id}
                  titel={artikelTitel(v.artikel)}
                  under={v.rad.bestalld_tid ? `Beställd ${datumKort(v.rad.bestalld_tid)} · ${v.plats.namn}` : underText(v)}
                  hoger={`${antalText(v.rad.antal ?? 0, v.artikel.enhet)} kvar`}
                  hogerUnder={`min ${v.rad.min_antal ?? 0}`}
                  dampad={!!v.rad.bestalld_tid}
                  onTryck={() => setOppet({ ark: 'bestall', radId: v.rad.id })}
                  sista={i === bestall.length - 1}
                  attr={{ 'data-bestall': v.rad.id }} />
              ))}
            </Sektion>
          )}

          <Falt etikett="Var finns det?" value={fraga} onChange={setFraga} placeholder="Mutterknackare, hjularm, Wisent…" name="sok" />

          {fraga.trim() ? (
            traffar.length > 0 ? (
              <Sektion rubrik={`${traffar.length} ${traffar.length === 1 ? 'träff' : 'träffar'}`}>
                {traffar.map((v, i) => (
                  <Rad key={v.rad.id}
                    titel={artikelTitel(v.artikel)}
                    under={underText(v)}
                    hoger={v.artikel.typ === 'forbrukning' ? `${antalText(v.rad.antal ?? 0, v.artikel.enhet)} kvar` : undefined}
                    onTryck={() => setOppet({ ark: 'rad', radId: v.rad.id })}
                    sista={i === traffar.length - 1}
                    attr={{ 'data-traff': v.rad.id }} />
                ))}
              </Sektion>
            ) : (
              <div style={{ marginBottom: AVSTAND.xl }} data-testid="ingen-traff">
                <p style={{ ...TYP.text, color: FARG.text, margin: `0 0 ${AVSTAND.m}px` }}>
                  Ingen {fraga.trim()} registrerad. Lägg till den där den ligger.
                </p>
                <button type="button" style={KNAPP.sekundar} onClick={() => setOppet({ ark: 'laggTill', namn: fraga.trim() })}>
                  Lägg till
                </button>
              </div>
            )
          ) : (
            <>
              {platsGrupper(inv.platser, medarbetare?.id ?? null).map(g => (
                <Sektion key={g.rubrik} rubrik={g.rubrik}>
                  {g.platser.map((p, i) => {
                    const av = p.senast_kollad_av ? inv.personer.find(x => x.id === p.senast_kollad_av)?.namn ?? null : null;
                    const k = kolladText(p, av);
                    return (
                      <Rad key={p.id} titel={p.namn} href={`/inventarier/plats/${p.id}`}
                        under={<span style={{ color: k.gammal ? FARG.orange : FARG.text2 }}>{k.text}</span>}
                        sista={i === g.platser.length - 1} attr={{ 'data-plats': p.id }} />
                    );
                  })}
                </Sektion>
              ))}
              {arAdmin && (
                <button type="button" style={KNAPP.sekundar} onClick={() => setOppet({ ark: 'nyPlats' })}>Ny plats</button>
              )}
            </>
          )}

          {oppet?.ark === 'bestall' && oppetRad && (
            <BestallArk v={oppetRad} onStang={() => setOppet(null)} onKlar={klar} />
          )}
          {oppet?.ark === 'rad' && oppetRad && (
            <RadArk v={oppetRad} platser={inv.platser} maskiner={inv.maskiner} artiklar={inv.artiklar}
              andraPlatser={inv.rader.filter(r => r.artikel_id === oppetRad.artikel.id && r.id !== oppetRad.rad.id).length}
              onStang={() => setOppet(null)} onKlar={klar} />
          )}
          {oppet?.ark === 'laggTill' && (
            <LaggTillArk inv={inv} platsId={null} startNamn={oppet.namn} onStang={() => setOppet(null)}
              onKlar={(t) => { setFraga(''); klar(t); }} />
          )}
          {oppet?.ark === 'nyPlats' && (
            <NyPlatsArk inv={inv} onStang={() => setOppet(null)} onKlar={(t) => klar(t)} />
          )}
        </>
      )}

      <Kvitto text={kvitto} onBorta={kvittoBorta} />
    </InvVy>
  );
}
