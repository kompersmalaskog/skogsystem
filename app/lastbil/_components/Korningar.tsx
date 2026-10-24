'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, KORT, TNUM, TYP } from '@/lib/design/tokens';
import { TryckRad } from './AttGoraKort';
import Periodval from './Periodval';
import RundaRad from './RundaRad';
import { fmtDatum } from './nu';
import { laddaNerCsv } from './csv';
import { periodEtikett, periodKort, periodTillText, type Manad } from './period';
import { rundorTillCsv, summera, type Runda, type Summa } from './rundor';
import type { RundorLage } from './useRundor';

function Status({ text, alert }: { text: string; alert?: boolean }) {
  return <p role={alert ? 'alert' : 'status'} style={{ ...TYP.text, color: alert ? FARG.rod : FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>{text}</p>;
}

/** Svaret i ord: "Flyttat maskiner 5 gånger", "Flyttat en maskin", "Inga maskinflyttar". Räknar FLYTTAR (benen) i rundor som räknas. */
export function flyttSvar(rundor: readonly Runda[]): string {
  const n = rundor.filter(r => r.giltig && r.flytt).reduce((s, r) => s + r.ben.length, 0);
  if (n === 0) return 'Inga maskinflyttar';
  if (n === 1) return 'Flyttat en maskin';
  return `Flyttat maskiner ${n} gånger`;
}

/** Anmärkningar som gäller summan: sägs i klartext, aldrig tyst. (Delas med Uppföljning.) */
export function Anmarkningar({ s }: { s: Summa }) {
  const rader = [
    s.overlappande > 0 && `${s.overlappande} rundor överlappar i tid och kan vara dubbelräknade i summorna.`,
    s.ogiltiga > 0 && `${s.ogiltiga} ${s.ogiltiga === 1 ? 'runda har' : 'rundor har'} sluttid före start och ingår inte i summorna.`,
    s.pagande > 0 && `${s.pagande} ${s.pagande === 1 ? 'runda pågår' : 'rundor pågår'} och räknas när de avslutats.`,
  ].filter(Boolean) as string[];
  if (!rader.length) return null;
  return <div>{rader.map(t => <p key={t} style={{ ...TYP.meta, color: FARG.orange, margin: `0 0 ${AVSTAND.xs}px` }}>{t}</p>)}</div>;
}

/**
 * "Vad har bilen gjort?" — svaret först (omtag 2026-10-23, Martin: "så lätt att ett barn förstår"). Rubriken är frågan, sedan
 * "‹ Oktober 2026 ›", sedan svaret i ord ("Flyttat maskiner 5 gånger") med körda km dämpat under ("892 km i oktober"), sedan ETT kort
 * med alla rundor i månaden, nyast först. Inga filter och inga l/mil här — förbrukningen och uppdelningen bor i Uppföljning
 * (raden "Uppföljning ›" under listan). Detaljen ligger i arket. Alla rundor räknas på sin svenska startdag. Är månaden tom
 * öppnar "Senaste körning: <datum>" den senaste rundans ark.
 */
export default function Korningar({ period, onPeriod, lage, onForsokIgen, onOppna, onOppnaAr, senaste, onOppnaSenaste }: {
  period: Manad; onPeriod: (p: Manad) => void; lage: RundorLage; onForsokIgen: () => void; onOppna: (r: Runda) => void;
  /** Raden "Uppföljning ›": öppnar uppföljningssidan (årets körning). */
  onOppnaAr: () => void;
  /** Bilens senaste avslutade körning (ur Var är bilen?-datan), för tomtexten i en tom månad. */
  senaste: { id: string; start: string } | null; onOppnaSenaste: (r: { id: string; start: string }) => void;
}) {
  return (
    <section aria-label="Körningar" data-korningar>
      <h2 style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.rubrik, color: FARG.text }}>Vad har bilen gjort?</h2>
      <div style={{ marginBottom: AVSTAND.m }}>
        <Periodval period={period} onPeriod={p => p.typ === 'man' && onPeriod(p)} />
      </div>
      <Inre period={period} lage={lage} onForsokIgen={onForsokIgen} onOppna={onOppna} onOppnaAr={onOppnaAr} senaste={senaste} onOppnaSenaste={onOppnaSenaste} />
      <FlyttplatserLank />
    </section>
  );
}

/** Flyttplatserna (snabbvalen i förarflödet) hanteras på egen sida — länken bodde i Flyttloggen och bor nu här. */
function FlyttplatserLank() {
  return (
    <Link href="/maskinflytt/platser" style={{ ...KNAPP.tertiar, textDecoration: 'none', display: 'flex', justifyContent: 'center', marginTop: AVSTAND.m }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>add_location_alt</span>
      Flyttplatser — hantera
    </Link>
  );
}

function Inre({ period, lage, onForsokIgen, onOppna, onOppnaAr, senaste, onOppnaSenaste }: {
  period: Manad; lage: RundorLage; onForsokIgen: () => void; onOppna: (r: Runda) => void; onOppnaAr: () => void;
  senaste: { id: string; start: string } | null; onOppnaSenaste: (r: { id: string; start: string }) => void;
}) {
  const rundor = lage.lage === 'klar' ? lage.rundor : null;
  const summa = useMemo(() => (rundor ? summera(rundor) : null), [rundor]);
  // ETT kort med alla rundor, nyast först (ingen veckoindelning, inget filter).
  const synliga = useMemo(() => [...(rundor ?? [])].sort((a, b) => Date.parse(b.start) - Date.parse(a.start)), [rundor]);

  if (lage.lage === 'laddar') return <Status text="Läser körningar …" />;
  if (lage.lage === 'fel' || !rundor || !summa) {
    return (
      <div style={{ textAlign: 'center', padding: `${AVSTAND.xl}px 0` }}>
        <Status text="Kunde inte läsa körningarna just nu." alert />
        <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      {/* Svaret: ord först, talet dämpat under */}
      <section style={KORT} aria-label="Månaden">
        <div data-manad-svar style={{ ...TYP.rubrik, color: FARG.text }}>{flyttSvar(rundor)}</div>
        <div data-manad-km style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{summa.km.toLocaleString('sv-SE')} km i {periodKort(period)}</div>
      </section>

      {synliga.length === 0 ? (
        <div>
          <p data-tom style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>
            {`Inga rundor i ${periodKort(period)}. Körningarna lästes utan fel.`}
          </p>
          {rundor.length === 0 && senaste && (
            <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.s }}>
              <TryckRad attr={{ 'data-senaste-korning': '' }} sista text={`Senaste körning: ${fmtDatum(senaste.start)}`} onTryck={() => onOppnaSenaste(senaste)} />
            </div>
          )}
        </div>
      ) : (
        <section aria-label="Rundor" data-rundlista style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
          {synliga.map((r, i) => <RundaRad key={r.id} runda={r} sista={i === synliga.length - 1} onOppna={onOppna} />)}
        </section>
      )}

      <Anmarkningar s={summa} />
      {/* Uppföljning (året): under listan, ovanför CSV */}
      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
        <TryckRad attr={{ 'data-uppfoljning': '' }} sista text="Uppföljning" onTryck={onOppnaAr} />
      </div>
      <button type="button" disabled={rundor.length === 0}
        onClick={() => laddaNerCsv(rundorTillCsv(rundor), `rundor-${periodTillText(period)}.csv`)}
        style={{ ...KNAPP.tertiar, alignSelf: 'center', opacity: rundor.length === 0 ? 0.4 : 1 }}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>download</span>
        Exportera {periodEtikett(period).toLowerCase()} som CSV
      </button>
    </div>
  );
}
