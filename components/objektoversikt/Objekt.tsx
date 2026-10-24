'use client';
// Objektöversikten för ETT objekt, så att ett barn förstår (Martin 2026-10-24). Samma innehåll och ordning på telefon,
// iPad och dator — bara uppställningen skiljer:
//  1. svaret: "Det tog 158 timmar", prognosen i ord och EN mening om varför,
//  2. Vem gjorde vad? — en stapel och en rad per del (raden fälls ut till maskinerna eller flyttarna),
//  3. Hur mycket virke? — mot prognosen och trädslagen,
//  4. tre rader som fälls ut på plats, en åt gången: Dag för dag, Vad skulle göras?, Fler siffror.
// All text och alla tal kommer ur byggObjektVy (lib/objektoversikt/vy.ts); här ritas bara. PDF:en ritas ur samma vymodell.
//
// Bredd: objektet är en container (container queries) — en kolumn på telefon, frågorna sida vid sida från 640 px och
// tre i rad från 960 px objektbredd. Platserna flödar i ordning (ingen grid-template-areas: React escapar citattecken
// i en <style> vid serverrendering).
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AVSTAND, FARG, KNAPP, KOLUMN, KORT, RADIE, TNUM, TRAFFYTA, TYP, overgang } from '@/lib/design/tokens';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import type { ObjektVy, Stapel as StapelDag, VemRad, VyRad } from '@/lib/objektoversikt/vy';
import { timmar } from '@/lib/objektoversikt/vy';
import type { Stapeldel } from '@/lib/markagarrapport/vy';
import PdfForhandsvisning from '@/app/helikopter/_components/PdfForhandsvisning';

export const TVA_KOLUMNER_PX = 640;
export const TRE_KOLUMNER_PX = 960;

const css = `
.oo-objekt { container-type: inline-size; max-width: ${KOLUMN.bred + 2 * AVSTAND.sidmarginal}px; margin: 0 auto; box-sizing: border-box; padding: ${AVSTAND.xl}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl * 2}px; }
.oo-svar { max-width: ${KOLUMN.smal}px; }
.oo-rutnat { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: ${AVSTAND.xl}px; align-items: start; }
@container (min-width: ${TVA_KOLUMNER_PX}px) { .oo-rutnat { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: ${TRE_KOLUMNER_PX}px) { .oo-rutnat { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
`;

type Oppen = 'dag' | 'plan' | 'fler' | null;

export default function Objekt({ vy }: { vy: ObjektVy }) {
  const [pdfOppen, setPdfOppen] = useState(false);
  const [mer, setMer] = useState<Oppen>(null);
  const vaxla = (k: Exclude<Oppen, null>) => () => setMer(m => (m === k ? null : k));

  return (
    <div className="oo-objekt" data-objekt-vy="">
      <style>{css}</style>

      <Link href="/admin/objektoversikt" className="oo-bara-smal"
        style={{ ...KNAPP.lank, textDecoration: 'none', marginBottom: AVSTAND.s, gap: AVSTAND.xs }}>
        <Ikon namn="chevron_left" farg={FARG.bla} />
        Alla objekt
      </Link>

      <header className="oo-svar" style={{ marginBottom: AVSTAND.xxl }} data-svar="">
        <h1 style={{ margin: 0, ...TYP.titel }}>{vy.namn}</h1>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: FARG.text2 }}>{vy.meta}</p>
        <p style={{ margin: `${AVSTAND.xl}px 0 0`, ...TYP.text, color: FARG.text2 }}>{vy.fraga}</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal }} data-svar-tal="">{vy.svar}</p>
        {vy.plan && (
          <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM }} data-plan="">
            {vy.plan.text}
            {vy.plan.avvikelse && (
              <><br /><span style={{ fontWeight: TYP.listtitel.fontWeight, color: vy.plan.varning ? FARG.orange : FARG.text }}>{vy.plan.avvikelse}</span></>
            )}
          </p>
        )}
        {vy.forklaring && (
          <p style={{ margin: `${AVSTAND.l}px 0 0`, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, background: FARG.upphojt, borderRadius: RADIE.kort, ...TYP.text }} data-forklaring="">
            {vy.forklaring}
          </p>
        )}
      </header>

      <div className="oo-rutnat">
        {vy.kvar && (
          <Fraga rubrik="Vad är kvar?">
            <Rader rader={vy.kvar} />
          </Fraga>
        )}

        {vy.vem && (
          <Fraga rubrik="Vem gjorde vad?">
            {vy.vem.stapel.length > 0 && <Stapel delar={vy.vem.stapel} etikett={vy.vem.rader.map(r => `${r.titel} ${r.hoger}`).join(', ')} />}
            <VemRader rader={vy.vem.rader} />
          </Fraga>
        )}

        {vy.virke && (
          <Fraga rubrik="Hur mycket virke?">
            <div style={{ padding: `${AVSTAND.m}px 0 0` }} data-virke="">
              <div style={{ ...TYP.titel, ...TNUM }}>{vy.virke.svar}</div>
              {vy.virke.under && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{vy.virke.under}</div>}
            </div>
            {vy.virke.stapel && <Stapel delar={vy.virke.stapel} etikett={vy.virke.rader.map(r => `${r.titel} ${r.hoger}`).join(', ')} />}
            <Rader rader={vy.virke.rader} />
            {vy.virke.rader.length === 0 && <div style={{ height: AVSTAND.m }} />}
          </Fraga>
        )}

        <Fraga rubrik="Mer om objektet">
          <UtRad titel="Dag för dag" oppen={mer === 'dag'} onTryck={vaxla('dag')} nyckel="dag" sista={!vy.uppdraget && !vy.fler && mer !== 'dag'} />
          {mer === 'dag' && (
            <Inne sista={!vy.uppdraget && !vy.fler}>
              {vy.dagar.staplar.length > 0
                ? <Graf staplar={vy.dagar.staplar} rubrik={vy.dagar.rubrik} />
                : <p style={{ margin: `${AVSTAND.s}px 0`, ...TYP.meta, color: FARG.text2 }}>Ingen tid från maskinerna än.</p>}
              {vy.dagar.not && <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.meta, color: FARG.text2 }}>{vy.dagar.not}</p>}
            </Inne>
          )}
          {vy.uppdraget && (
            <>
              <UtRad titel="Vad skulle göras?" oppen={mer === 'plan'} onTryck={vaxla('plan')} nyckel="plan" sista={!vy.fler && mer !== 'plan'} />
              {mer === 'plan' && <Inne sista={!vy.fler}><Rader rader={vy.uppdraget} /></Inne>}
            </>
          )}
          {vy.fler && (
            <>
              <UtRad titel="Fler siffror" oppen={mer === 'fler'} onTryck={vaxla('fler')} nyckel="fler" sista={mer !== 'fler'} />
              {mer === 'fler' && <Inne sista><Rader rader={vy.fler} /></Inne>}
            </>
          )}
        </Fraga>
      </div>

      <button type="button" onClick={() => setPdfOppen(true)} data-pdf=""
        style={{ ...KNAPP.primar, display: 'flex', width: '100%', maxWidth: KOLUMN.smal, margin: `${AVSTAND.s}px 0 0`, gap: AVSTAND.s }}>
        <Ikon namn="ios_share" farg="inherit" />
        Dela som PDF
      </button>

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

/** En fråga: rubriken i vanliga ord över ett kort. */
function Fraga({ rubrik, children }: { rubrik: string; children: ReactNode }) {
  return (
    <section aria-label={rubrik} style={{ marginBottom: AVSTAND.xxl }}>
      <h2 style={{ margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px`, ...TYP.rubrik }}>{rubrik}</h2>
      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>{children}</div>
    </section>
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

/** En stapel som visar delarna av en helhet. Färgen bär aldrig ensam: raderna under har ordet och talet. */
function Stapel({ delar, etikett }: { delar: Stapeldel[]; etikett: string }) {
  return (
    <div role="img" aria-label={etikett}
      style={{ display: 'flex', gap: AVSTAND.xs / 2, height: AVSTAND.m, borderRadius: RADIE.stapel, overflow: 'hidden', margin: `${AVSTAND.l}px 0 ${AVSTAND.xs}px` }}>
      {delar.map(d => <div key={d.nyckel} style={{ flex: `${d.andel} 1 0`, minWidth: AVSTAND.xs, background: d.farg }} />)}
    </div>
  );
}

function titelMedPrick(r: VyRad): ReactNode {
  return r.farg ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.m }}>
      <Prick farg={r.farg} kontur={r.kontur} />{r.titel}
    </span>
  ) : r.titel;
}

function underText(r: VyRad): ReactNode {
  if (!r.under && !r.under2) return undefined;
  const u = (
    <>
      {r.under && <span style={r.varning ? { color: FARG.orange } : undefined}>{r.under}</span>}
      {r.under && r.under2 && <br />}
      {r.under2}
    </>
  );
  return r.farg ? <span style={{ display: 'block', paddingLeft: AVSTAND.m + AVSTAND.m }}>{u}</span> : u;
}

function Rader({ rader }: { rader: VyRad[] }) {
  return (
    <>
      {rader.map((r, i) => (
        <Rad
          key={r.nyckel}
          titel={titelMedPrick(r)}
          under={underText(r)}
          hoger={r.hoger || undefined}
          hogerUnder={r.hogerUnder ?? undefined}
          dampad={r.dampad}
          sista={i === rader.length - 1}
          attr={{ 'data-rad': r.nyckel }}
        />
      ))}
    </>
  );
}

/** Vem gjorde vad? — en rad per del; har raden detaljer fälls de ut på plats (en åt gången). */
function VemRader({ rader }: { rader: VemRad[] }) {
  const [oppen, setOppen] = useState<string | null>(null);
  return (
    <>
      {rader.map((r, i) => {
        const sista = i === rader.length - 1;
        const kanOppnas = r.detaljer.length > 0;
        const ar = oppen === r.nyckel;
        return (
          <div key={r.nyckel}>
            <Rad
              titel={titelMedPrick(r)}
              under={underText(r)}
              hoger={r.hoger || undefined}
              hogerUnder={r.hogerUnder ?? undefined}
              onTryck={kanOppnas ? () => setOppen(ar ? null : r.nyckel) : undefined}
              pil={kanOppnas}
              sista={sista && !ar}
              attr={kanOppnas ? { 'data-rad': r.nyckel, 'aria-expanded': String(ar) } : { 'data-rad': r.nyckel }}
            />
            {ar && <Inne sista={sista}><Smala rader={r.detaljer} /></Inne>}
          </div>
        );
      })}
    </>
  );
}

/** Detaljerna under en utfälld rad: indragna, mindre text, ingen egen linje mellan. */
function Smala({ rader }: { rader: VyRad[] }) {
  return (
    <>
      {rader.map(r => (
        <div key={r.nyckel} data-detalj={r.nyckel}
          style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, padding: `${AVSTAND.xs}px 0 ${AVSTAND.xs}px ${AVSTAND.xl}px`, ...TYP.text }}>
          <span style={{ minWidth: 0 }}>
            {r.titel}
            {r.under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{r.under}</span>}
          </span>
          <span style={{ ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>
            {r.hoger}
            {r.hogerUnder && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{r.hogerUnder}</span>}
          </span>
        </div>
      ))}
    </>
  );
}

function UtRad({ titel, oppen, onTryck, nyckel, sista }: { titel: string; oppen: boolean; onTryck: () => void; nyckel: string; sista: boolean }) {
  return (
    <Rad titel={titel} onTryck={onTryck} pil sista={sista}
      attr={{ 'data-mer': nyckel, 'aria-expanded': String(oppen) }} />
  );
}

/** Det som fälls ut under en rad: en linje under (utom sist i kortet). */
function Inne({ sista, children }: { sista: boolean; children: ReactNode }) {
  return (
    <div style={{ padding: `${AVSTAND.xs}px 0 ${AVSTAND.m}px`, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      {children}
    </div>
  );
}

const DEL_NAMN = { skordare: 'Skördaren', skotare: 'Skotaren', flytt: 'Flytt', planering: 'Planering', manuellt: 'Manuellt', annat: 'Annat' } as const;
const STAPEL_H = 96;   // grafens höjd — ett layoutmått för ytan, inte ett avstånd
const TOM_H = 2;       // en tom dag är ett tunt streck: dagen finns, den var tom
const DAMPAD = 0.4;

/** Timmar per dag (eller vecka): staplade i delarnas färger, dämpade utom den valda; tryck på en stapel visar den. */
function Graf({ staplar, rubrik }: { staplar: StapelDag[]; rubrik: string }) {
  const max = Math.max(...staplar.map(s => s.min), 1);
  const forval = (() => { for (let i = staplar.length - 1; i >= 0; i--) if (staplar[i].min > 0) return i; return staplar.length - 1; })();
  const [vald, setVald] = useState(forval);
  const v = staplar[Math.min(vald, staplar.length - 1)];
  const visaEtikett = (i: number) => staplar.length <= 16 || i === vald || i % 3 === 0;
  return (
    <div style={{ padding: `${AVSTAND.s}px 0 ${AVSTAND.s}px` }} data-graf="">
      <p style={{ margin: 0, ...TYP.listtitel, ...TNUM }} data-graf-vald="">
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
