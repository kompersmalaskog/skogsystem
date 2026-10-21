'use client';
// Markägarrapporten — så att ett barn förstår (Martin 2026-10-21). Varje del är en fråga i vanliga ord och svaret
// står först. All text och alla tal kommer ur byggRapportVy (lib/markagarrapport/vy.ts); här ritas bara.
//
// Bredd: rapporten är en container (container queries), så korten ligger i en kolumn på telefon, två bredvid varandra
// från 640 px rapportbredd (iPad, och iPad liggande med listan bredvid) och tre från 960 px (dator), med kartan över
// hela bredden under.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AVSTAND, FARG, KNAPP, KOLUMN, KORT, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Ikon from '@/components/design/Ikon';
import { tradslagFarg, TRADSLAG_STIL } from '@/lib/tradslag';
import type { RapportVy, Stapeldel, VyRad } from '@/lib/markagarrapport/vy';
import type { MarkagarRapport } from '@/lib/markagarrapport/types';
import SkogenKarta from './SkogenKarta';
import PdfForhandsvisning from '@/app/helikopter/_components/PdfForhandsvisning';

/** Rapportbredd där korten går från en till två och från två till tre kolumner. */
export const TVA_KOLUMNER_PX = 640;
export const TRE_KOLUMNER_PX = 960;

const css = `
.mr-rapport { container-type: inline-size; max-width: ${KOLUMN.bred + 2 * AVSTAND.sidmarginal}px; margin: 0 auto; box-sizing: border-box; padding: ${AVSTAND.xl}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl * 2}px; }
.mr-rutnat { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: ${AVSTAND.xl}px; align-items: start; }
@container (min-width: ${TVA_KOLUMNER_PX}px) { .mr-rutnat { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: ${TRE_KOLUMNER_PX}px) { .mr-rutnat { grid-template-columns: repeat(3, minmax(0, 1fr)); } .mr-karta { grid-column: 1 / -1; } }
`;

export default function Rapport({ vy, stammar }: { vy: RapportVy; stammar: MarkagarRapport['karta']['stammar'] }) {
  const [merOppen, setMerOppen] = useState(false);
  const [pdfOppen, setPdfOppen] = useState(false);
  return (
    <div className="mr-rapport" data-rapport="">
      <style>{css}</style>

      <Link href="/admin/markagarrapport" className="mr-bara-smal"
        style={{ ...KNAPP.lank, textDecoration: 'none', marginBottom: AVSTAND.s, gap: AVSTAND.xs }}>
        <Ikon namn="chevron_left" farg={FARG.bla} />
        Alla rapporter
      </Link>

      <header style={{ marginBottom: AVSTAND.xxl }} data-svar="">
        <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{vy.huvud}</p>
        {vy.vardeFraga && <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.text, color: FARG.text2 }}>{vy.vardeFraga}</p>}
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal }}>{vy.svar}</p>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM }}>{vy.underSvar}</p>
        {/* Rapportens EN handling: PDF:en till markägaren (förhandsvisning, sedan Dela → mejl, meddelande, spara). */}
        <button type="button" onClick={() => setPdfOppen(true)} data-pdf=""
          style={{ ...KNAPP.primar, display: 'inline-flex', width: 'auto', marginTop: AVSTAND.xl, gap: AVSTAND.s }}>
          <Ikon namn="ios_share" farg="inherit" />
          Skicka till markägaren
        </button>
      </header>

      <div className="mr-rutnat">
        {vy.virket && (
          <Sektion rubrik="Vad blev virket?" not={vy.virket.not} inset>
            <Stapel delar={vy.virket.stapel} etikett={vy.virket.rader.map(r => `${r.namn} ${r.hogerUnder}`).join(', ')} />
            <Rader rader={vy.virket.rader} />
          </Sektion>
        )}

        {vy.trad && (
          <Sektion rubrik="Vilka träd växte här?" inset>
            <Stapel delar={vy.trad.stapel} etikett={vy.trad.rader.map(r => `${r.namn} ${r.hoger}`).join(', ')} />
            <Rader rader={vy.trad.rader} />
          </Sektion>
        )}

        {vy.granar && (
          <Sektion rubrik="Var granarna friska?" not={vy.granar.not ?? undefined} inset>
            <div style={{ paddingTop: AVSTAND.l, paddingBottom: vy.granar.rader.length ? 0 : AVSTAND.l }} data-granar="">
              {vy.granar.bild && <Granar friska={vy.granar.bild.friska} rotade={vy.granar.bild.rotade} />}
              <p style={{ margin: vy.granar.bild ? `${AVSTAND.l}px 0 0` : 0, ...TYP.rubrik }}>{vy.granar.rubrik}</p>
              {vy.granar.text && <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: FARG.text2 }}>{vy.granar.text}</p>}
              {vy.granar.rader.length > 0 && (
                <div style={{ marginTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` }}>
                  <Rader rader={vy.granar.rader} utanPrick />
                </div>
              )}
            </div>
          </Sektion>
        )}

        <div className="mr-karta">
          <Sektion rubrik="Här växte träden" kort={false} inset>
            {stammar.length > 0 ? (
              <>
                <SkogenKarta stammar={stammar} />
                <Teckenforklaring />
              </>
            ) : (
              <div style={{ ...KORT }}><p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Träden har inga positioner, så kartan kan inte ritas.</p></div>
            )}
          </Sektion>
        </div>
      </div>

      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
        <Rad titel="Mer för den som vill veta" under="pris per sortiment och timmerdimensioner" onTryck={() => setMerOppen(true)} sista
          attr={{ 'data-mer': '' }} />
      </div>

      {pdfOppen && (
        <PdfForhandsvisning
          skapa={async () => (await import('@/lib/markagarrapport/pdf')).skapaMarkagarPdf(vy, stammar)}
          filnamn={vy.filnamn}
          titel={`Markägarrapport ${vy.namn}`}
          onStang={() => setPdfOppen(false)}
        />
      )}
      {merOppen && <MerArk mer={vy.mer} onStang={() => setMerOppen(false)} />}
    </div>
  );
}

function Prick({ farg, kontur }: { farg: string; kontur?: string | null }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-block', width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0,
      boxShadow: kontur ? `0 0 0 1px ${kontur}` : `0 0 0 1px ${FARG.linje}`,
    }} />
  );
}

function Rader({ rader, utanPrick }: { rader: VyRad[]; utanPrick?: boolean }) {
  return (
    <>
      {rader.map((r, i) => (
        <Rad
          key={r.nyckel}
          titel={utanPrick || !r.farg ? r.namn : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.m }}>
              <Prick farg={r.farg} kontur={r.kontur} />{r.namn}
            </span>
          )}
          under={r.under && (utanPrick || !r.farg ? r.under : <span style={{ paddingLeft: AVSTAND.m + AVSTAND.m }}>{r.under}</span>)}
          hoger={r.hoger}
          hogerUnder={r.hogerUnder}
          sista={i === rader.length - 1}
        />
      ))}
    </>
  );
}

/** En stapel som visar delarna av en helhet. Färgen bär aldrig ensam: raderna under har ordet och talet. */
function Stapel({ delar, etikett }: { delar: Stapeldel[]; etikett: string }) {
  return (
    <div role="img" aria-label={etikett}
      style={{ display: 'flex', gap: AVSTAND.xs, height: AVSTAND.l, borderRadius: RADIE.stapel, overflow: 'hidden', margin: `${AVSTAND.l}px 0 ${AVSTAND.xs}px`, outline: `1px solid ${FARG.linje}` }}>
      {delar.map(d => <div key={d.nyckel} style={{ flex: `${d.andel} 1 0`, minWidth: AVSTAND.xs, background: d.farg }} />)}
    </div>
  );
}

/** Små granar: de friska i granens färg, de rötade grå med orange stam (röta sitter i roten). */
function Granar({ friska, rotade }: { friska: number; rotade: number }) {
  const gran = tradslagFarg('Gran');
  const lista = [...Array(friska).fill(false), ...Array(rotade).fill(true)] as boolean[];
  return (
    <div role="img" aria-label={`${friska} friska granar och ${rotade} med röta`} style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s }}>
      {lista.map((rotad, i) => (
        <svg key={i} width="32" height="42" viewBox="0 0 40 52" aria-hidden="true">
          <path d="M20 2 7 22h7L4 38h32l-10-16h7z" fill={rotad ? FARG.text3 : gran} />
          <rect x="17" y="38" width="6" height="12" rx="1" fill={rotad ? FARG.orange : FARG.text2} />
        </svg>
      ))}
    </div>
  );
}

function Teckenforklaring() {
  const del = (farg: string, text: string, kontur?: string | null): ReactNode => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}><Prick farg={farg} kontur={kontur} />{text}</span>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.s}px ${AVSTAND.l}px`, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: FARG.text2 }}>
      {del(tradslagFarg('Gran'), 'Gran')}
      {del(tradslagFarg('Tall'), 'Tall')}
      {del(TRADSLAG_STIL['Björk'].fyll, 'Björk')}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}>
        <span aria-hidden="true" style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, boxSizing: 'border-box', border: `2px solid ${FARG.rod}` }} />
        Röta
      </span>
      <span>Större prick = grövre träd</span>
    </div>
  );
}

function MerArk({ mer, onStang }: { mer: RapportVy['mer']; onStang: () => void }) {
  return (
    <Ark rubrik="Mer om avverkningen" onStang={onStang}>
      <div style={{ paddingTop: AVSTAND.s }}>
        {mer.sortiment.length > 0 && (
          <Sektion rubrik="Sortiment · volym och värde" kort={false}>
            {mer.sortiment.map((r, i) => (
              <Rad key={r.nyckel} titel={r.namn} under={r.under} hoger={r.hoger} hogerUnder={r.hogerUnder} sista={i === mer.sortiment.length - 1} />
            ))}
          </Sektion>
        )}
        {mer.dimensioner.map(t => (
          <Sektion key={t.namn} rubrik={`Timmerdimensioner · ${t.namn}`} kort={false}>
            {t.rader.map((r, i) => (
              <Rad key={r.nyckel} titel={r.namn} hoger={r.hoger} hogerUnder={r.hogerUnder} sista={i === t.rader.length - 1} />
            ))}
          </Sektion>
        ))}
        {mer.sortiment.length === 0 && mer.dimensioner.length === 0 && (
          <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Det finns inga sortiment med pris för den här avverkningen.</p>
        )}
      </div>
    </Ark>
  );
}

