'use client';

/**
 * FAKTURAUNDERLAG — två lägen: listan och en trakt.
 *
 * LISTAN är lodrät och grupperad på TILLSTÅND, inte en vågrät remsa med
 * likvärdiga kort. Sidoskrollning kostar dubbelt: man måste både leta och
 * minnas var man var. En lodrät lista skannas med ögat, och grupperna säger
 * vad som ska göras i stället för att tvinga fram en härledning ur siffror.
 * Överst ETT tal — antal trakter klara att fakturera och deras summa.
 *
 * TRAKTEN delas upp PER MASKIN, och traktens tillägg står för sig.
 * Grundpriset kommer ur prislistan och är olika per maskin; tillägget hör
 * till TRAKTEN och delas. Blandas de ihop går det inte att se varför Gigant
 * får 58,00 och Wisent 56,50.
 *
 * FÄRGER OCH TYPSNITT UR lib/design/tokens.ts. Skissen ritades i en
 * gröntonad palett med IBM Plex innan tokens var känt; strukturen ovan är
 * det som skulle överleva, inte färgerna. Ett andra mörkt tema i appen vore
 * precis det som "samma i hela appen" ska förhindra.
 *
 * Ingenting sparas och ingenting skickas till Fortnox härifrån.
 */

import { useEffect, useState } from 'react';
import {
  FARG, TYP, AVSTAND, RADIE, TRAFFYTA, VY_ROT, KORT, FONT, TAL_FONT,
} from '@/lib/design/tokens';

type Rad = {
  radnr: number; artikelnr: string | null; benamning: string;
  antal: number | null; enhet: string | null;
  prisagare: string; a_pris: number | null; a_pris_beraknat: number | null;
  harledning: { etikett: string; belopp: number; ungefarlig?: boolean }[] | null;
  kalla: string; status: string; fel_kod: string | null; kostnadsstalle: string | null;
  delar_grundpris: number | null; delar_andel: number | null; delar_avstand: number | null;
};
type Detalj = {
  vo_nummer: string; objektnamn: string; kund: number | null; bolag: string | null;
  avtalsform: string; avrakningsdatum: string | null; objekt_ids: string[];
  rader: Rad[]; noter: { niva: string; text: string }[]; hinder: string[];
  gar_att_skicka: boolean; summa_kant: number; rader_utan_pris: number; fel?: string;
};
type OversiktsRad = {
  vo_nummer: string; namn: string; bolag: string | null; kund: number | null;
  avtalsform: 'ackord' | 'timpeng'; avrakningsdatum: string | null;
  mangd: number; mangd_enhet: 'm3fub' | 'h'; summa: number; orsak?: string;
};
type HemlosFlytt = { id: string; datum: string; maskin: string; km: number | null; traillertimmar: number | null };
type Oversikt = {
  fonster: { dagar: number; max: number; byggda: number; klara_totalt: number; utanfor: number };
  grupper: { klara: OversiktsRad[]; atgard: OversiktsRad[]; vantar: OversiktsRad[]; pagar: OversiktsRad[] };
  flyttar_utan_trakt: HemlosFlytt[];
};

const DAGAR = 90;

const nr = (n: number, dec = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const kr2 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FakturaunderlagClient() {
  const [oversikt, setOversikt] = useState<Oversikt | null>(null);
  const [listFel, setListFel] = useState<string | null>(null);
  const [oppen, setOppen] = useState<string | null>(null);
  const [detalj, setDetalj] = useState<Detalj | null>(null);
  const [detaljFel, setDetaljFel] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/faktura/oversikt?dagar=${DAGAR}`);
        const j = await r.json();
        if (!r.ok || !j.ok) { setListFel(j?.meddelande || `Servern svarade ${r.status}.`); return; }
        setOversikt(j);
      } catch (e: any) { setListFel(e?.message || 'Anropet gick inte fram.'); }
    })();
  }, []);

  async function oppna(vo: string) {
    setOppen(vo); setDetalj(null); setDetaljFel(null);
    try {
      const r = await fetch('/api/faktura/underlag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vo_nummer: vo, dry_run: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setDetaljFel(j?.meddelande || `Servern svarade ${r.status}.`); return; }
      setDetalj(j.resultat?.[0] || null);
    } catch (e: any) { setDetaljFel(e?.message || 'Anropet gick inte fram.'); }
  }

  // 120 = frigång för den fasta bottennavigationen, samma som
  // app/ekonomi/delade/mall.tsx. Fysiskt mått, inte en designtoken.
  const rot: React.CSSProperties = { ...VY_ROT, paddingBottom: 120, maxWidth: 1280, margin: '0 auto' };

  if (oppen) {
    return (
      <div style={rot}>
        <TraktVy vo={oppen} detalj={detalj} fel={detaljFel}
          tillbaka={() => { setOppen(null); setDetalj(null); setDetaljFel(null); }} />
      </div>
    );
  }

  return (
    <div style={rot}>
      <h1 style={{ ...TYP.titel, margin: `${AVSTAND.xl}px 0 0` }}>Fakturaunderlag</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
        Ingenting sparas och ingenting skickas till Fortnox förrän du granskat.
      </p>

      {listFel && <Ruta titel="Kunde inte läsa underlagen" text={listFel} varning />}
      {!listFel && !oversikt && (
        <p style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xl }}>
          Bygger underlagen för trakter avräknade de senaste {DAGAR} dagarna…
        </p>
      )}

      {oversikt && (
        <>
          <Huvudtal antal={oversikt.grupper.klara.length}
            summa={oversikt.grupper.klara.reduce((s, r) => s + r.summa, 0)} />

          <Grupp titel="Klara att fakturera" rader={oversikt.grupper.klara} oppna={oppna}
            tomText={`Ingen trakt är klar bland dem som avräknats de senaste ${DAGAR} dagarna.`} />

          <Grupp titel="Behöver åtgärd" rader={oversikt.grupper.atgard} oppna={oppna} visaOrsak
            tomText="Inget underlag stoppas av något just nu." />

          <Grupp titel="Väntar på inmätning" rader={oversikt.grupper.vantar} oppna={oppna} visaOrsak
            tomText="Inget à conto är skickat från appen än. Fakturor skickade för hand syns inte här — de är inte kopplade till sitt vo-nummer." />

          <Grupp titel="Pågår" rader={oversikt.grupper.pagar} oppna={oppna} visaOrsak dampad
            tomText="Ingen trakt är påbörjad men oavslutad." />

          <FlyttarUtanTrakt flyttar={oversikt.flyttar_utan_trakt} />

          {oversikt.fonster.utanfor > 0 && (
            <p style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.xl }}>
              {oversikt.fonster.utanfor} slutavräknade trakter ligger utanför fönstret på{' '}
              {oversikt.fonster.dagar} dagar och är inte byggda. Av{' '}
              {oversikt.fonster.klara_totalt} slutavräknade visas {oversikt.fonster.byggda}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ── Delar ─────────────────────────────────────────────────────────────── */

function Huvudtal({ antal, summa }: { antal: number; summa: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m,
                  margin: `${AVSTAND.xxl}px 0 0`, flexWrap: 'wrap' }}>
      <span style={{ ...TYP.tal, ...TAL_FONT }}>{antal}</span>
      <div>
        <p style={{ ...TYP.rubrik, margin: 0 }}>
          {antal === 1 ? 'trakt klar att fakturera' : 'trakter klara att fakturera'}
        </p>
        <p style={{ ...TYP.meta, ...TAL_FONT, margin: `${AVSTAND.xs}px 0 0`, color: FARG.text2 }}>
          {nr(summa)} kr
        </p>
      </div>
    </div>
  );
}

function Grupp({ titel, rader, oppna, visaOrsak, dampad, tomText }: {
  titel: string; rader: OversiktsRad[]; oppna: (vo: string) => void;
  visaOrsak?: boolean; dampad?: boolean; tomText: string;
}) {
  return (
    <div style={{ marginTop: AVSTAND.xl }}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>{titel}</p>
      <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
        {rader.length === 0 ? (
          <p style={{ ...TYP.meta, color: FARG.text3, margin: 0, padding: `${AVSTAND.l}px` }}>{tomText}</p>
        ) : rader.map((r, i) => (
          <div key={r.vo_nummer}>
            {i > 0 && <div style={{ height: 1, background: FARG.linje, marginLeft: AVSTAND.l }} />}
            <button type="button" onClick={() => oppna(r.vo_nummer)}
              style={{
                display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%',
                padding: `${AVSTAND.m}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.min,
                boxSizing: 'border-box', background: 'none', border: 'none',
                color: 'inherit', textAlign: 'left', fontFamily: FONT,
                cursor: 'pointer', flexWrap: 'wrap',
              }}>
              <span style={{ ...TYP.text, flexGrow: 1, minWidth: 180,
                             color: dampad ? FARG.text2 : FARG.text }}>{r.namn}</span>
              {visaOrsak ? (
                <span style={{ ...TYP.meta, flexBasis: '100%',
                               color: dampad ? FARG.text3 : FARG.orange }}>{r.orsak}</span>
              ) : (
                <>
                  <span style={{ ...TYP.meta, color: FARG.text2, minWidth: 90 }}>{r.bolag || '—'}</span>
                  <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2,
                                 minWidth: 110, textAlign: 'right' }}>
                    {nr(r.mangd, r.mangd_enhet === 'h' ? 1 : 0)}{' '}
                    {r.mangd_enhet === 'h' ? 'tim' : 'm³fub'}
                  </span>
                  <span style={{ ...TYP.text, ...TAL_FONT, minWidth: 90, textAlign: 'right' }}>
                    {nr(r.summa)}
                  </span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Flytten bärs av trakten man LÄMNAR. Saknas fran_objekt_id hör raden till
 * ingen trakt och skulle aldrig synas — tre av sex aktiva flyttar är så.
 * Att falla tillbaka på "till" hade lagt dem på FEL trakt, och de hade sett
 * rätt ut. Därför en egen grupp i stället.
 */
function FlyttarUtanTrakt({ flyttar }: { flyttar: HemlosFlytt[] }) {
  if (!flyttar?.length) return null;
  return (
    <div style={{ marginTop: AVSTAND.xl }}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
        Flyttar utan trakt
      </p>
      <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
        {flyttar.map((f, i) => (
          <div key={f.id}>
            {i > 0 && <div style={{ height: 1, background: FARG.linje, marginLeft: AVSTAND.l }} />}
            <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.min }}>
              <span style={{ ...TYP.text }}>{f.maskin} · {f.km ?? '?'} km · {f.datum}</span>
              <p style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.xs}px 0 0` }}>
                Saknar avreseobjekt — flytten hamnar inte på någon trakt
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ruta({ titel, text, varning }: { titel: string; text: string; varning?: boolean }) {
  return (
    <div style={{ ...KORT, marginTop: AVSTAND.xl }}>
      <p style={{ ...TYP.listtitel, margin: 0, color: varning ? FARG.orange : FARG.text }}>{titel}</p>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{text}</p>
    </div>
  );
}

/* ── Trakten ───────────────────────────────────────────────────────────── */

function TraktVy({ vo, detalj, fel, tillbaka }: {
  vo: string; detalj: Detalj | null; fel: string | null; tillbaka: () => void;
}) {
  return (
    <>
      <button type="button" onClick={tillbaka}
        style={{ ...TYP.text, background: 'none', border: 'none', color: FARG.bla,
                 fontFamily: FONT, padding: `${AVSTAND.xl}px 0 0`,
                 cursor: 'pointer', minHeight: TRAFFYTA.min }}>
        ← Alla underlag
      </button>

      {fel && <Ruta titel="Underlaget kunde inte byggas" text={fel} varning />}
      {!fel && !detalj && (
        <p style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xl }}>Bygger raderna för {vo}…</p>
      )}
      {detalj && <TraktInnehall d={detalj} />}
    </>
  );
}

function TraktInnehall({ d }: { d: Detalj }) {
  const maskinRader = d.rader.filter(r => ['1', '2', '11', '12'].includes(r.artikelnr || ''));
  const ovriga = d.rader.filter(r => !maskinRader.includes(r) && r.antal !== 0);

  // Traktens tillägg står i ackordraden. Grundraden och avståndet hör till
  // maskinen, resten till trakten.
  const harl = maskinRader.find(r => r.artikelnr === '1')?.harledning || [];
  const traktensTillagg = harl.filter(h =>
    h.belopp !== 0 && !h.etikett.startsWith('Grund') && h.etikett !== 'Avstånd');
  const attFordela = traktensTillagg.reduce((s, h) => s + h.belopp, 0);
  const fordelningsnot = harl.find(h => h.etikett.startsWith('Fördelning ändrad'));
  const kontrakt = d.rader.find(r => r.artikelnr === '8')?.benamning || '';

  return (
    <>
      <h1 style={{ ...TYP.titel, margin: `${AVSTAND.l}px 0 0` }}>{d.objektnamn}</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
        {d.bolag || '—'} · {d.avtalsform} · VO {d.vo_nummer}
        {kontrakt.startsWith('Kontraktsnr ') ? ` · ${kontrakt.toLowerCase()}` : ''}
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m,
                    margin: `${AVSTAND.xl}px 0 0`, flexWrap: 'wrap' }}>
        <span style={{ ...TYP.tal, ...TAL_FONT }}>{nr(d.summa_kant)}</span>
        <div>
          <p style={{ ...TYP.rubrik, margin: 0 }}>kr att fakturera</p>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>
            {d.avrakningsdatum ? `Avslutad ${d.avrakningsdatum}` : 'Inte avräknad'}
            {d.rader_utan_pris > 0 && ` · ${d.rader_utan_pris} rader utan hämtat pris`}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: AVSTAND.l, marginTop: AVSTAND.xl, flexWrap: 'wrap' }}>
        {maskinRader.map(r => <Maskinkort key={r.radnr} r={r} />)}
      </div>

      {traktensTillagg.length > 0 && (
        <div style={{ marginTop: AVSTAND.xl }}>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
            Traktens tillägg — delas mellan maskinerna
          </p>
          <div style={{ ...KORT, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            {traktensTillagg.map((h, i) => (
              <Prisrad key={i} etikett={h.etikett} belopp={h.belopp} dampad tecken />
            ))}
            <div style={{ height: 1, background: FARG.linje }} />
            <Prisrad etikett="Att fördela" belopp={attFordela} stor />
            {fordelningsnot && (
              <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>{fordelningsnot.etikett}</p>
            )}
          </div>
        </div>
      )}

      {ovriga.length > 0 && (
        <div style={{ marginTop: AVSTAND.xl }}>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
            Övriga rader
          </p>
          <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
            {ovriga.map((r, i) => {
              const pris = r.a_pris ?? r.a_pris_beraknat;
              return (
                <div key={r.radnr}>
                  {i > 0 && <div style={{ height: 1, background: FARG.linje, marginLeft: AVSTAND.l }} />}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m,
                                padding: `${AVSTAND.m}px ${AVSTAND.l}px`, flexWrap: 'wrap' }}>
                    <span style={{ ...TYP.text, flexGrow: 1, minWidth: 160 }}>{r.benamning}</span>
                    <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2,
                                   minWidth: 90, textAlign: 'right' }}>
                      {r.antal == null ? '—' : kr2(r.antal)} {r.enhet === 'h' ? 'tim' : r.enhet || ''}
                    </span>
                    <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2,
                                   minWidth: 70, textAlign: 'right' }}>
                      {pris == null ? 'hämtas' : kr2(pris)}
                    </span>
                    <span style={{ ...TYP.text, ...TAL_FONT, minWidth: 100, textAlign: 'right' }}>
                      {pris != null && r.antal != null ? `${nr(pris * r.antal)} kr` : '—'}
                    </span>
                  </div>
                  {r.status !== 'klar' && (
                    <p style={{ ...TYP.meta, color: FARG.orange,
                                margin: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>
                      {r.status === 'fel' ? `Går inte att prissätta: ${r.fel_kod}` : 'Väntar på leverantörsfaktura'}
                    </p>
                  )}
                  {!!r.harledning?.length && (
                    <p style={{ ...TYP.meta, color: FARG.text2,
                                margin: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>
                      {r.harledning.filter(h => h.belopp === 0).map(h => h.etikett).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(d.hinder.length > 0 || d.noter.length > 0) && (
        <div style={{ marginTop: AVSTAND.xl, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 0 ${AVSTAND.xs}px` }}>Att titta på</p>
          {d.hinder.map((h, i) => (
            <p key={`h${i}`} style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>{h}</p>
          ))}
          {d.noter.map((n, i) => (
            <p key={`n${i}`} style={{ ...TYP.text, margin: 0,
                                      color: n.niva === 'varning' ? FARG.text : FARG.text2 }}>{n.text}</p>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m,
                    marginTop: AVSTAND.xxl, flexWrap: 'wrap' }}>
        <button type="button" disabled
          style={{ ...TYP.text, fontFamily: FONT, padding: `0 ${AVSTAND.xl}px`,
                   height: TRAFFYTA.primar, border: 'none', borderRadius: RADIE.knapp,
                   background: FARG.gron, color: FARG.bg, opacity: 0.4, cursor: 'default' }}>
          Markera som granskad
        </button>
        <span style={{ ...TYP.meta, color: FARG.text2 }}>
          Granskning och sändning är inte byggt än — den här vyn räknar bara fram raderna.
        </span>
      </div>
    </>
  );
}

function Maskinkort({ r }: { r: Rad }) {
  const pris = r.a_pris_beraknat;
  const grund = r.harledning?.find(h => h.etikett.startsWith('Grund'));
  const arTimpeng = r.artikelnr === '11' || r.artikelnr === '12';
  const verb = r.artikelnr === '1' || r.artikelnr === '11' ? 'Skördning' : 'Skotning';
  // Benämningen är "Skördning ackord Gigant" — maskinnamnet är resten.
  const namn = r.benamning.split(' ').slice(2).join(' ') || r.benamning;

  return (
    <div style={{ ...KORT, flexGrow: 1, flexBasis: 300, minWidth: 260,
                  display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <div>
        <p style={{ ...TYP.rubrik, margin: 0 }}>{namn}</p>
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>
          {verb} · {r.kostnadsstalle ? `kostnadsställe ${r.kostnadsstalle}` : 'kostnadsställe saknas'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        {r.delar_grundpris != null && (
          <Prisrad dampad belopp={r.delar_grundpris}
            etikett={arTimpeng ? 'Timpris'
              : (grund?.etikett.replace('Grund ', '').replace(/[()]/g, '') || 'Grundpris')} />
        )}
        {!arTimpeng && !!r.delar_andel && (
          <Prisrad dampad tecken etikett="Andel av traktens tillägg" belopp={r.delar_andel} />
        )}
        {!arTimpeng && !!r.delar_avstand && (
          <Prisrad dampad tecken etikett="Skotningsavstånd" belopp={r.delar_avstand} />
        )}
      </div>

      <div style={{ height: 1, background: FARG.linje }} />
      <Prisrad etikett={arTimpeng ? 'Pris per timme' : 'Pris per m³fub'} belopp={pris} stor />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m }}>
        <span style={{ ...TYP.meta, ...TAL_FONT, flexGrow: 1, color: FARG.text2 }}>
          × {kr2(r.antal)} {arTimpeng ? 'tim' : 'm³fub'}
        </span>
        <span style={{ ...TYP.text, ...TAL_FONT }}>
          {pris != null && r.antal != null ? `${nr(pris * r.antal)} kr` : '—'}
        </span>
      </div>
    </div>
  );
}

function Prisrad({ etikett, belopp, stor, dampad, tecken }: {
  etikett: string; belopp: number | null; stor?: boolean; dampad?: boolean; tecken?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m }}>
      <span style={{ ...TYP.text, flexGrow: 1, color: dampad ? FARG.text2 : FARG.text }}>{etikett}</span>
      <span style={{ ...(stor ? TYP.rubrik : TYP.text), ...TAL_FONT }}>
        {belopp == null ? '—' : `${tecken && belopp > 0 ? '+' : ''}${kr2(belopp)}`}
      </span>
    </div>
  );
}
