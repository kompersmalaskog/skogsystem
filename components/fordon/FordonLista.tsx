'use client';

// /kontroller — Fordon. EN fråga: "Behöver något fordon något just nu?"
// Svaret först (ETT tal, eller "Allt är i ordning"), sedan det som är försenat, det som är snart,
// det som saknar datum, en hopfälld rad för resten — och sist alla fordon per sort.
// Inga flikar, inga chips: allt ligger på EN sida i den ordning man behöver det.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Falt from '@/components/design/Falt';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { useRaknaUpp } from '@/lib/design/raknaUpp';
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import { fmtDatumKort, type Resurs } from '@/lib/kontroller-format';
import { byggListVy, statusFor, tidText, type Punkt } from '@/lib/fordon/vy';
import FordonArk from './FordonArk';
import { FelLage, FordonVy, Laddar, StatusOrd } from './delar';

/** Sökfältet visas först när listan är så lång att man behöver det. */
const SOK_FRAN = 9;

type State = { lage: 'laddar' } | { lage: 'fel'; fel: string } | { lage: 'klar'; resurser: Resurs[] };

function PunktRad({ p, sista, visaStatus }: { p: Punkt; sista: boolean; visaStatus: boolean }) {
  const status = visaStatus ? statusFor(p.lage) : null;
  return (
    <Rad
      titel={p.fordon}
      under={p.lage === 'ok' ? `${p.kontroll} · ${fmtDatumKort(p.forfall!)}` : p.lage === 'saknar' ? p.kontroll : `${p.kontroll} · ${tidText(p)}`}
      hoger={status ? <StatusOrd ord={status.ord} ton={status.ton} /> : undefined}
      href={`/kontroller/${p.resursId}`}
      sista={sista}
      attr={{ 'data-punkt': p.kontrollId, 'data-lage': p.lage }}
    />
  );
}

export default function FordonLista({ kanRedigera }: { kanRedigera: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ lage: 'laddar' });
  const [visaSenare, setVisaSenare] = useState(false);
  const [sok, setSok] = useState('');
  const [nytt, setNytt] = useState(false);

  const hamta = useCallback(async () => {
    setState(s => (s.lage === 'klar' ? s : { lage: 'laddar' }));
    try {
      const r = await fetch('/api/resurs', { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok || !body.ok) { setState({ lage: 'fel', fel: body.error || `HTTP ${r.status}` }); return; }
      setState({ lage: 'klar', resurser: body.resurs || [] });
    } catch (e: any) {
      setState({ lage: 'fel', fel: e?.message || String(e) });
    }
  }, []);
  useEffect(() => { hamta(); }, [hamta]);

  const resurser = state.lage === 'klar' ? state.resurser : null;
  const vy = useMemo(() => (resurser ? byggListVy(resurser) : null), [resurser]);
  const visatTal = useRaknaUpp(vy?.svar.slag === 'tal' ? vy.svar.tal : 0, 0);

  const q = sok.trim().toLowerCase();
  const grupper = useMemo(() => {
    if (!vy) return [];
    if (!q) return vy.grupper;
    return vy.grupper
      .map(g => ({ ...g, fordon: g.fordon.filter(f => `${f.namn} ${f.under}`.toLowerCase().includes(q)) }))
      .filter(g => g.fordon.length > 0);
  }, [vy, q]);

  return (
    <FordonVy>
      {state.lage === 'laddar' && <Laddar text="Läser fordonen…" />}
      {state.lage === 'fel' && <FelLage rubrik="Kunde inte läsa fordonen." fel={state.fel} onForsok={hamta} />}

      {vy && (
        <>
          <Tillstand nyckel={vy.svar.slag}>
            {vy.svar.slag === 'tal' ? (
              <div style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }} data-testid="fordon-tal">
                <div style={{ ...TYP.tal, color: FARG.text }}>{visatTal}</div>
                <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{vy.svar.text}</div>
                {vy.svar.rad && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{vy.svar.rad}</div>}
              </div>
            ) : (
              <Svarsrad rubrik={vy.svar.rubrik}
                rad={vy.antalFordon === 0
                  ? (kanRedigera
                    ? 'Lägg till bilar, släp, maskiner och tankar så räknar appen ned till besiktning och försäkring.'
                    : 'Arbetsledningen lägger in fordonen.')
                  : vy.svar.rad}
                fri />
            )}
          </Tillstand>

          {vy.forsenade.length > 0 && (
            <Sektion rubrik="Gör nu">
              {vy.forsenade.map((p, i) => <PunktRad key={p.kontrollId} p={p} visaStatus sista={i === vy.forsenade.length - 1} />)}
            </Sektion>
          )}

          {vy.snart.length > 0 && (
            <Sektion rubrik="Snart">
              {vy.snart.map((p, i) => <PunktRad key={p.kontrollId} p={p} visaStatus sista={i === vy.snart.length - 1} />)}
            </Sektion>
          )}

          {vy.saknar.length > 0 && (
            <Sektion rubrik="Datum saknas" not="Registrera när det senast gjordes, så räknar appen ned.">
              {vy.saknar.map((p, i) => <PunktRad key={p.kontrollId} p={p} visaStatus={false} sista={i === vy.saknar.length - 1} />)}
            </Sektion>
          )}

          {vy.senare.length > 0 && (
            <Sektion rubrik="Senare">
              {visaSenare
                ? vy.senare.map((p, i) => <PunktRad key={p.kontrollId} p={p} visaStatus={false} sista={i === vy.senare.length - 1} />)
                : <Rad titel={`${vy.senare.length} ${vy.senare.length === 1 ? 'kontroll' : 'kontroller'} längre fram`}
                    onTryck={() => setVisaSenare(true)} sista attr={{ 'data-testid': 'visa-senare' }} />}
            </Sektion>
          )}

          {vy.antalFordon >= SOK_FRAN && (
            <Falt etikett="Sök fordon" value={sok} onChange={setSok} placeholder="Regnummer eller namn" name="sok" />
          )}

          {grupper.map(g => (
            <Sektion key={g.key} rubrik={g.label}>
              {g.fordon.map((f, i) => (
                <Rad key={f.id}
                  titel={f.namn}
                  under={f.under}
                  hoger={f.status ? <StatusOrd ord={f.status.ord} ton={f.status.ton} /> : undefined}
                  href={`/kontroller/${f.id}`}
                  sista={i === g.fordon.length - 1}
                  attr={{ 'data-fordon': f.id }} />
              ))}
            </Sektion>
          ))}

          {q && grupper.length === 0 && (
            <p style={{ ...TYP.text, color: FARG.text2, margin: `0 0 ${AVSTAND.xl}px` }}>Inget fordon heter så.</p>
          )}

          {kanRedigera && (
            <button type="button" style={KNAPP.sekundar} onClick={() => setNytt(true)} data-testid="lagg-till-fordon">
              Lägg till fordon
            </button>
          )}
        </>
      )}

      {nytt && (
        <FordonArk befintlig={null} arAdmin={kanRedigera}
          onStang={() => setNytt(false)}
          onSparad={r => { setNytt(false); router.push(`/kontroller/${r.id}`); }} />
      )}
    </FordonVy>
  );
}
