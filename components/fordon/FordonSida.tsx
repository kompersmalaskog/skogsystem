'use client';

// /kontroller/<id> — ett fordon. Svaret först ("Besiktning om 12 dagar"), EN vit knapp (Registrera),
// sedan kontrollerna, det som senast gjordes, ekonomin (bara admin) och Ändra fordon.
// Ett tryck på en kontroll öppnar Registrera med just den kontrollen vald.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import { fmtDatumLang, fmtHeltal, resursRubrik, type Resurs } from '@/lib/kontroller-format';
import { HANDELSE_LABEL, byggFordonVy } from '@/lib/fordon/vy';
import FordonArk from './FordonArk';
import RegistreraArk from './RegistreraArk';
import { FelLage, FordonVy, Laddar, StatusOrd, Tillbaka } from './delar';

type Handelse = { id?: string; typ: string; benamning: string | null; datum: string; utford_av?: string | null; kostnad?: number | null };
type State = { lage: 'laddar' } | { lage: 'fel'; fel: string } | { lage: 'saknas' } | { lage: 'klar'; resurs: Resurs; historik: Handelse[] };
type Oppet = { ark: 'registrera'; kontrollId: string | null } | { ark: 'andra' } | null;

/** Så många rader av historiken syns innan "Visa alla". */
const HISTORIK_SYNLIGA = 5;

export default function FordonSida({ id, kanRedigera }: { id: string; kanRedigera: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ lage: 'laddar' });
  const [oppet, setOppet] = useState<Oppet>(null);
  const [visaAlla, setVisaAlla] = useState(false);

  const hamta = useCallback(async () => {
    setState(s => (s.lage === 'klar' ? s : { lage: 'laddar' }));
    try {
      const [rR, hR] = await Promise.all([
        fetch(`/api/resurs/${id}`, { cache: 'no-store' }),
        fetch(`/api/handelse?resurs_id=${id}`, { cache: 'no-store' }),
      ]);
      if (rR.status === 404) { setState({ lage: 'saknas' }); return; }
      const rBody = await rR.json();
      const hBody = await hR.json().catch(() => ({}));
      if (!rR.ok || !rBody.ok) { setState({ lage: 'fel', fel: rBody.error || `HTTP ${rR.status}` }); return; }
      setState({ lage: 'klar', resurs: rBody.resurs, historik: hR.ok && hBody.ok ? hBody.handelser || [] : [] });
    } catch (e: any) {
      setState({ lage: 'fel', fel: e?.message || String(e) });
    }
  }, [id]);
  useEffect(() => { hamta(); }, [hamta]);

  const resurs = state.lage === 'klar' ? state.resurs : null;
  const vy = useMemo(() => (resurs ? byggFordonVy(resurs) : null), [resurs]);

  return (
    <FordonVy>
      <Tillbaka href="/kontroller" text="Fordon" />

      {state.lage === 'laddar' && <Laddar text="Läser fordonet…" />}
      {state.lage === 'fel' && <FelLage rubrik="Kunde inte läsa fordonet." fel={state.fel} onForsok={hamta} />}
      {state.lage === 'saknas' && (
        <Svarsrad rubrik="Fordonet finns inte längre" rad="Det kan ha tagits bort. Gå tillbaka till Fordon." fri />
      )}

      {state.lage === 'klar' && resurs && vy && (() => {
        const { titel, underrad } = resursRubrik(resurs);
        const historik = state.historik;
        const synlig = visaAlla ? historik : historik.slice(0, HISTORIK_SYNLIGA);
        const harEkonomi = kanRedigera && (resurs.inkopspris != null || !!resurs.inkopsdatum);
        return (
          <>
            <h1 style={{ ...TYP.titel, color: FARG.text, margin: `${AVSTAND.s}px 0 0` }}>{titel}</h1>
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{underrad}</div>

            <Svarsrad rubrik={vy.svar.rubrik} rad={vy.svar.rad} avvikelse={vy.svar.avvikelse} fri />

            {kanRedigera && vy.kontroller.length > 0 && (
              <button type="button" style={{ ...KNAPP.primar, marginBottom: AVSTAND.xl }} data-testid="registrera"
                onClick={() => setOppet({ ark: 'registrera', kontrollId: null })}>
                Registrera
              </button>
            )}

            {vy.kontroller.length > 0 && (
              <Sektion rubrik="Kontroller">
                {vy.kontroller.map((k, i) => (
                  <Rad key={k.kontrollId}
                    titel={k.titel}
                    under={k.under}
                    hoger={k.status ? <StatusOrd ord={k.status.ord} ton={k.status.ton} /> : undefined}
                    onTryck={kanRedigera ? () => setOppet({ ark: 'registrera', kontrollId: k.kontrollId }) : undefined}
                    sista={i === vy.kontroller.length - 1}
                    attr={{ 'data-kontrollrad': k.kontrollId }} />
                ))}
              </Sektion>
            )}

            {historik.length > 0 && (
              <Sektion rubrik="Senast gjort">
                {synlig.map((h, i) => (
                  <Rad key={h.id || `${h.typ}-${h.datum}-${i}`}
                    titel={h.benamning || HANDELSE_LABEL[h.typ] || h.typ}
                    under={[fmtDatumLang(h.datum), h.utford_av].filter(Boolean).join(' · ')}
                    hoger={kanRedigera && h.kostnad != null ? `${fmtHeltal(h.kostnad)} kr` : undefined}
                    sista={i === synlig.length - 1 && (visaAlla || historik.length <= HISTORIK_SYNLIGA)} />
                ))}
                {!visaAlla && historik.length > HISTORIK_SYNLIGA && (
                  <Rad titel={`Visa alla ${historik.length}`} onTryck={() => setVisaAlla(true)} sista />
                )}
              </Sektion>
            )}

            {harEkonomi && (
              <Sektion rubrik="Ekonomi" not="Syns bara för admin.">
                <Rad titel="Inköpspris" hoger={resurs.inkopspris != null ? `${fmtHeltal(resurs.inkopspris)} kr` : '–'} />
                <Rad titel="Inköpt" hoger={resurs.inkopsdatum ? fmtDatumLang(resurs.inkopsdatum) : '–'} sista />
              </Sektion>
            )}

            {resurs.anteckning && (
              <Sektion rubrik="Anteckning">
                <Rad titel={resurs.anteckning} sista />
              </Sektion>
            )}

            {kanRedigera && (
              <button type="button" style={KNAPP.sekundar} onClick={() => setOppet({ ark: 'andra' })} data-testid="andra-fordon">
                Ändra fordon
              </button>
            )}
          </>
        );
      })()}

      {oppet?.ark === 'registrera' && resurs && (
        <RegistreraArk resurs={resurs} forvald={oppet.kontrollId}
          onStang={() => setOppet(null)}
          onSparad={() => { setOppet(null); hamta(); }} />
      )}
      {oppet?.ark === 'andra' && resurs && (
        <FordonArk befintlig={resurs} arAdmin={kanRedigera}
          onStang={() => setOppet(null)}
          onSparad={() => { setOppet(null); hamta(); }}
          onBorttagen={() => { setOppet(null); router.push('/kontroller'); }} />
      )}
    </FordonVy>
  );
}
