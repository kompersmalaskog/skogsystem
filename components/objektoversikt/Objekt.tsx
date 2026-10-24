'use client';
// Objektöversikten för ETT objekt — svaret först ("Hur lång tid tog objektet?"), sedan frågor i vanliga ord.
// All text och alla tal kommer ur byggObjektVy (lib/objektoversikt/vy.ts); här ritas bara. PDF:en ritas ur samma vymodell.
//
// Bredd: objektet är en container (container queries) som markägarrapporten — en kolumn på telefon, två från 640 px
// objektbredd, tre från 960 px.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AVSTAND, FARG, KNAPP, KOLUMN, RADIE, TNUM, TRAFFYTA, TYP, overgang } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import type { ObjektVy, Stapel as StapelDag, VyRad } from '@/lib/objektoversikt/vy';
import { timmar } from '@/lib/objektoversikt/vy';
import type { Stapeldel } from '@/lib/markagarrapport/vy';
import PdfForhandsvisning from '@/app/helikopter/_components/PdfForhandsvisning';

export const TVA_KOLUMNER_PX = 640;
export const TRE_KOLUMNER_PX = 960;

const css = `
.oo-objekt { container-type: inline-size; max-width: ${KOLUMN.bred + 2 * AVSTAND.sidmarginal}px; margin: 0 auto; box-sizing: border-box; padding: ${AVSTAND.xl}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl * 2}px; }
.oo-rutnat { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: ${AVSTAND.xl}px; align-items: start; }
/* Platserna sätts med rad/kolumn, inte grid-template-areas: React escapar citattecken i en <style> vid serverrendering. */
@container (min-width: ${TVA_KOLUMNER_PX}px) {
  .oo-rutnat { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .oo-a-tid { grid-column: 1; grid-row: 1; } .oo-a-plan { grid-column: 2; grid-row: 1; }
  .oo-a-flytt { grid-column: 1; grid-row: 2; } .oo-a-blev { grid-column: 2; grid-row: 2; }
  .oo-med-kvar .oo-a-kvar { grid-column: 1; grid-row: 1; } .oo-med-kvar .oo-a-tid { grid-row: 2; }
  .oo-med-kvar .oo-a-plan { grid-row: 1 / span 2; } .oo-med-kvar .oo-a-flytt { grid-row: 3; } .oo-med-kvar .oo-a-blev { grid-row: 3; }
}
@container (min-width: ${TRE_KOLUMNER_PX}px) {
  .oo-rutnat { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .oo-a-tid { grid-column: 1; grid-row: 1 / span 2; } .oo-a-flytt { grid-column: 2; grid-row: 1; }
  .oo-a-blev { grid-column: 2; grid-row: 2; } .oo-a-plan { grid-column: 3; grid-row: 1 / span 2; }
  .oo-med-kvar .oo-a-kvar { grid-column: 1; grid-row: 1; } .oo-med-kvar .oo-a-tid { grid-row: 2 / span 2; }
  .oo-med-kvar .oo-a-flytt { grid-row: 1; } .oo-med-kvar .oo-a-blev { grid-row: 2; } .oo-med-kvar .oo-a-plan { grid-row: 1 / span 3; }
}
`;

export default function Objekt({ vy }: { vy: ObjektVy }) {
  const [pdfOppen, setPdfOppen] = useState(false);
  return (
    <div className="oo-objekt" data-objekt-vy="">
      <style>{css}</style>

      <Link href="/admin/objektoversikt" className="oo-bara-smal"
        style={{ ...KNAPP.lank, textDecoration: 'none', marginBottom: AVSTAND.s, gap: AVSTAND.xs }}>
        <Ikon namn="chevron_left" farg={FARG.bla} />
        Alla objekt
      </Link>

      <header style={{ marginBottom: AVSTAND.xxl }} data-svar="">
        <h1 style={{ margin: 0, ...TYP.rubrik }}>{vy.namn}</h1>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{vy.meta}</p>
        <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.text, color: FARG.text2 }}>{vy.fraga}</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal }}>{vy.svar}</p>
        {vy.underSvar && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM }}>{vy.underSvar}</p>}
        <button type="button" onClick={() => setPdfOppen(true)} data-pdf=""
          style={{ ...KNAPP.primar, display: 'inline-flex', width: 'auto', marginTop: AVSTAND.xl, gap: AVSTAND.s }}>
          <Ikon namn="ios_share" farg="inherit" />
          Dela som PDF
        </button>
      </header>

      <div className={`oo-rutnat${vy.kvar ? ' oo-med-kvar' : ''}`}>
        {vy.kvar && (
          <div className="oo-a-kvar">
            <Sektion rubrik="Vad är kvar?" inset><Rader rader={vy.kvar} /></Sektion>
          </div>
        )}
        <div className="oo-a-tid">
          <Sektion rubrik="Vart gick tiden?" not={vy.tid.not ?? undefined} inset>
            {vy.tid.staplar.length > 0 && <Graf staplar={vy.tid.staplar} rubrik={vy.tid.stapelRubrik} />}
            <Rader rader={vy.tid.rader} />
          </Sektion>
        </div>
        {vy.flyttar && (
          <div className="oo-a-flytt">
            <Sektion rubrik="Hur kom maskinerna hit?" not="Tiden är från att maskinen lastades tills den lossades." inset>
              <Rader rader={vy.flyttar} />
            </Sektion>
          </div>
        )}
        {vy.blev && (
          <div className="oo-a-blev">
            <Sektion rubrik="Vad blev det?" inset>
              {vy.trad && (
                <div data-trad="">
                  <Stapel delar={vy.trad.stapel} etikett={vy.trad.rader.map(r => `${r.titel} ${r.hogerUnder}`).join(', ')} />
                  <Rader rader={vy.trad.rader} />
                  <div style={{ borderBottom: `1px solid ${FARG.linje}` }} />
                </div>
              )}
              <Rader rader={vy.blev} />
            </Sektion>
          </div>
        )}
        {vy.uppdraget && (
          <div className="oo-a-plan">
            <Sektion rubrik="Vad skulle göras?" not="Enligt planeringen." inset><Rader rader={vy.uppdraget} /></Sektion>
          </div>
        )}
      </div>

      {pdfOppen && (
        <PdfForhandsvisning
          skapa={async () => {
            const { skapaObjektPdf } = await import('@/lib/objektoversikt/pdf');
            return skapaObjektPdf(vy);
          }}
          filnamn={vy.filnamn}
          titel={`Objektöversikt ${vy.namn}`}
          onStang={() => setPdfOppen(false)}
        />
      )}
    </div>
  );
}

function Prick({ farg, kontur }: { farg: string; kontur?: string | null }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-block', width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0,
      boxShadow: `0 0 0 1px ${kontur ?? FARG.linje}`,
    }} />
  );
}

/** En stapel som visar delarna av en helhet (samma som markägarrapporten). Färgen bär aldrig ensam: raderna under har ordet och talet. */
function Stapel({ delar, etikett }: { delar: Stapeldel[]; etikett: string }) {
  return (
    <div role="img" aria-label={etikett}
      style={{ display: 'flex', gap: AVSTAND.xs, height: AVSTAND.l, borderRadius: RADIE.stapel, overflow: 'hidden', margin: `${AVSTAND.l}px 0 ${AVSTAND.xs}px`, outline: `1px solid ${FARG.linje}` }}>
      {delar.map(d => <div key={d.nyckel} style={{ flex: `${d.andel} 1 0`, minWidth: AVSTAND.xs, background: d.farg }} />)}
    </div>
  );
}

function Rader({ rader }: { rader: VyRad[] }) {
  return (
    <>
      {rader.map((r, i) => {
        const under: ReactNode = (r.under || r.under2 || r.facit) ? (
          <>
            {r.under && <span style={r.varning ? { color: FARG.orange } : undefined}>{r.under}</span>}
            {r.under && r.facit && <br />}
            {r.facit}
            {(r.under || r.facit) && r.under2 && <br />}
            {r.under2}
          </>
        ) : undefined;
        return (
          <Rad
            key={r.nyckel}
            titel={r.farg ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.m }}>
                <Prick farg={r.farg} kontur={r.kontur} />{r.titel}
              </span>
            ) : r.titel}
            under={r.farg && under ? <span style={{ display: 'block', paddingLeft: AVSTAND.m + AVSTAND.m }}>{under}</span> : under}
            hoger={r.hoger || undefined}
            hogerUnder={r.hogerUnder ?? undefined}
            dampad={r.dampad}
            sista={i === rader.length - 1}
            attr={{ 'data-rad': r.nyckel }}
          />
        );
      })}
    </>
  );
}

const DEL_NAMN = { skordare: 'Skördaren', skotare: 'Skotaren', flytt: 'Flytt', planering: 'Planering', manuellt: 'Manuellt', annat: 'Annat' } as const;
const STAPEL_H = 96;   // grafens höjd — ett layoutmått för ytan, inte ett avstånd
const TOM_H = 2;       // en tom dag är ett tunt streck: dagen finns, den var tom
const DAMPAD = 0.4;

/** Timmar per dag (eller vecka) som Min tids staplar: vita, dämpade utom den valda; tryck på en stapel visar den. */
function Graf({ staplar, rubrik }: { staplar: StapelDag[]; rubrik: string }) {
  const max = Math.max(...staplar.map(s => s.min), 1);
  const forval = (() => { for (let i = staplar.length - 1; i >= 0; i--) if (staplar[i].min > 0) return i; return staplar.length - 1; })();
  const [vald, setVald] = useState(forval);
  const v = staplar[Math.min(vald, staplar.length - 1)];
  const visaEtikett = (i: number) => staplar.length <= 16 || i === vald || i % 3 === 0;
  return (
    <div style={{ padding: `${AVSTAND.l}px 0 ${AVSTAND.m}px`, borderBottom: `1px solid ${FARG.linje}` }} data-graf="">
      <p style={{ margin: 0, ...TYP.micro, color: FARG.text2 }}>{rubrik}</p>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.listtitel, ...TNUM }} data-graf-vald="">
        {v.lang} · {v.min > 0 ? timmar(v.min) : 'ingen tid'}
      </p>
      {/* Vad dagen gick till, i staplarnas färger — en rad som alltid tar plats så grafen inte hoppar. */}
      <p style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.m}px`, minHeight: TYP.meta.fontSize * 1.3, margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px`, ...TYP.meta, ...TNUM, color: FARG.text2 }} data-graf-delar="">
        {v.delar.map(d => (
          <span key={d.nyckel} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}>
            <Prick farg={d.farg} />{DEL_NAMN[d.nyckel]} {timmar(d.min)}
          </span>
        ))}
      </p>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }} role="group" aria-label={rubrik}>
        {staplar.map((s, i) => (
          <button key={s.nyckel} type="button" onClick={() => setVald(i)} aria-pressed={i === vald}
            aria-label={`${s.lang}: ${s.min > 0 ? timmar(s.min) : 'ingen tid'}`}
            style={{ flex: '1 1 0', minWidth: 0, minHeight: TRAFFYTA.min, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 0, margin: 0, border: 'none', background: 'none', cursor: 'pointer', color: FARG.text, font: 'inherit' }}>
            <span style={{ width: '100%', height: STAPEL_H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {s.min > 0 ? (
                // Delarna staplade nerifrån (skördare, skotare, flytt …), i delens färg.
                <span style={{
                  width: '70%', height: Math.max(TOM_H * 2, (s.min / max) * STAPEL_H), display: 'flex', flexDirection: 'column-reverse',
                  borderRadius: `${RADIE.stapel}px ${RADIE.stapel}px 0 0`, overflow: 'hidden',
                  opacity: i === vald ? 1 : DAMPAD, transition: overgang('opacity'),
                }}>
                  {s.delar.map(d => <span key={d.nyckel} style={{ flex: `${d.min} 1 0`, minHeight: 1, background: d.farg }} />)}
                </span>
              ) : (
                <span style={{ width: '70%', height: TOM_H, background: FARG.text3, opacity: DAMPAD }} />
              )}
            </span>
            <span style={{ ...TYP.meta, ...TNUM, marginTop: AVSTAND.xs, color: i === vald ? FARG.text : FARG.text2, visibility: visaEtikett(i) ? 'visible' : 'hidden' }}>{s.etikett}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
