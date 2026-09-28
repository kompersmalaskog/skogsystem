'use client';

/**
 * FAKTURAUNDERLAG — två lägen: listan och en trakt.
 *
 * LISTAN är lodrät och grupperad på TILLSTÅND, inte en vågrät remsa med
 * likvärdiga kort. Sidoskrollning kostar dubbelt: man måste både leta och
 * minnas var man var. En lodrät lista skannas med ögat, och grupperna säger
 * vad som ska göras i stället för att tvinga fram en härledning ur siffror.
 * Överst ETT tal — antal trakter klara att fakturera och deras summa — för
 * det är den enda siffran som leder till ett beslut.
 *
 * TRAKTEN delas upp PER MASKIN, och traktens tillägg står för sig.
 * Grundpriset kommer ur prislistan och är olika per maskin; tillägget hör
 * till TRAKTEN och delas. Blandas de ihop går det inte att se varför Gigant
 * får 58,00 och Wisent 56,50.
 *
 * Ingenting sparas och ingenting skickas till Fortnox härifrån.
 */

import { useEffect, useState } from 'react';
import { F, SANS, MONO, TAL, nr, kr2 } from './stil';

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
type Oversikt = {
  fonster: { dagar: number; max: number; byggda: number; klara_totalt: number; utanfor: number };
  grupper: { klara: OversiktsRad[]; atgard: OversiktsRad[]; vantar: OversiktsRad[]; pagar: OversiktsRad[] };
};

const DAGAR = 90;

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

  const rot: React.CSSProperties = {
    minHeight: '100vh', background: F.bg, color: F.text, fontFamily: SANS,
    padding: '0 16px 120px', boxSizing: 'border-box', maxWidth: 1280, margin: '0 auto',
  };

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
      <h1 style={{ margin: '28px 0 0', fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em' }}>
        Fakturaunderlag
      </h1>
      <p style={{ margin: '8px 0 0', fontSize: 15, color: F.dampad }}>
        Ingenting sparas och ingenting skickas till Fortnox förrän du granskat.
      </p>

      {listFel && <Ruta titel="Kunde inte läsa underlagen" text={listFel} varning />}
      {!listFel && !oversikt && (
        <p style={{ fontSize: 15, color: F.dampad, marginTop: 28 }}>
          Bygger underlagen för trakter avräknade de senaste {DAGAR} dagarna…
        </p>
      )}

      {oversikt && (
        <>
          <Huvudtal
            antal={oversikt.grupper.klara.length}
            summa={oversikt.grupper.klara.reduce((s, r) => s + r.summa, 0)}
          />

          <Grupp titel="Klara att fakturera" rader={oversikt.grupper.klara} oppna={oppna}
            tomText={`Ingen trakt är klar att fakturera bland dem som avräknats de senaste ${DAGAR} dagarna.`} />

          <Grupp titel="Behöver åtgärd" rader={oversikt.grupper.atgard} oppna={oppna} visaOrsak
            tomText="Inget underlag stoppas av något just nu." />

          <Grupp titel="Väntar på inmätning" rader={oversikt.grupper.vantar} oppna={oppna} visaOrsak
            tomText="Inget à conto är skickat från appen än. Fakturor skickade för hand syns inte här — de är inte kopplade till sitt vo-nummer." />

          <Grupp titel="Pågår" rader={oversikt.grupper.pagar} oppna={oppna} visaOrsak dampad
            tomText="Ingen trakt är påbörjad men oavslutad." />

          {oversikt.fonster.utanfor > 0 && (
            <p style={{ fontSize: 14, color: F.svagast, marginTop: 24 }}>
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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, margin: '34px 0 0', flexWrap: 'wrap' }}>
      <span style={{ ...TAL, fontSize: 76, fontWeight: 400, lineHeight: 0.9, letterSpacing: '-0.04em' }}>
        {antal}
      </span>
      <div>
        <p style={{ margin: 0, fontSize: 20 }}>
          {antal === 1 ? 'trakt klar att fakturera' : 'trakter klara att fakturera'}
        </p>
        <p style={{ ...TAL, margin: '5px 0 0', fontSize: 16, color: F.dampad }}>{nr(summa)} kr</p>
      </div>
    </div>
  );
}

function Grupp({ titel, rader, oppna, visaOrsak, dampad, tomText }: {
  titel: string; rader: OversiktsRad[]; oppna: (vo: string) => void;
  visaOrsak?: boolean; dampad?: boolean; tomText: string;
}) {
  return (
    <div style={{ marginTop: 26 }}>
      <p style={{ margin: '0 0 10px 4px', fontSize: 13, color: F.dampad }}>{titel}</p>
      <div style={{ background: F.kort, borderRadius: 14, overflow: 'hidden' }}>
        {rader.length === 0 ? (
          <p style={{ margin: 0, padding: '17px 22px', fontSize: 15, color: F.svagast }}>{tomText}</p>
        ) : rader.map((r, i) => (
          <div key={r.vo_nummer}>
            {i > 0 && <div style={{ height: 1, background: F.linje, marginLeft: 22 }} />}
            <button type="button" onClick={() => oppna(r.vo_nummer)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, width: '100%',
                padding: '17px 22px', minHeight: 44, boxSizing: 'border-box',
                background: 'none', border: 'none', color: 'inherit', textAlign: 'left',
                fontFamily: SANS, cursor: 'pointer', flexWrap: 'wrap',
              }}>
              <span style={{ flexGrow: 1, minWidth: 180, fontSize: 17, color: dampad ? F.dampad : F.text }}>
                {r.namn}
              </span>
              {visaOrsak ? (
                <span style={{ fontSize: 15, color: dampad ? F.svagast : F.varning, flexBasis: '100%' }}>
                  {r.orsak}
                </span>
              ) : (
                <>
                  <span style={{ fontSize: 14, color: F.dampad, minWidth: 90 }}>{r.bolag || '—'}</span>
                  <span style={{ ...TAL, fontSize: 15, color: F.dampad, minWidth: 110, textAlign: 'right' }}>
                    {nr(r.mangd, r.mangd_enhet === 'h' ? 1 : 0)}{' '}
                    {r.mangd_enhet === 'h' ? 'tim' : 'm³fub'}
                  </span>
                  <span style={{ ...TAL, fontSize: 17, minWidth: 90, textAlign: 'right' }}>{nr(r.summa)}</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ruta({ titel, text, varning }: { titel: string; text: string; varning?: boolean }) {
  return (
    <div style={{ background: F.kort, borderRadius: 14, padding: '20px 24px', marginTop: 24 }}>
      <p style={{ margin: 0, fontSize: 17, color: varning ? F.varning : F.text }}>{titel}</p>
      <p style={{ margin: '6px 0 0', fontSize: 15, color: F.dampad }}>{text}</p>
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
        style={{ background: 'none', border: 'none', color: F.dampad, fontFamily: SANS,
                 fontSize: 15, padding: '28px 0 0', cursor: 'pointer', minHeight: 44 }}>
        ← Alla underlag
      </button>

      {fel && <Ruta titel="Underlaget kunde inte byggas" text={fel} varning />}
      {!fel && !detalj && (
        <p style={{ fontSize: 15, color: F.dampad, marginTop: 24 }}>Bygger raderna för {vo}…</p>
      )}
      {detalj && <TraktInnehall d={detalj} />}
    </>
  );
}

function TraktInnehall({ d }: { d: Detalj }) {
  const ackordRader = d.rader.filter(r => r.artikelnr === '1' || r.artikelnr === '2');
  const timRader = d.rader.filter(r => r.artikelnr === '11' || r.artikelnr === '12');
  const maskinRader = [...ackordRader, ...timRader];
  const ovriga = d.rader.filter(r => !maskinRader.includes(r) && r.antal !== 0);

  // Traktens tillägg står i vilken ackordrad som helst — de är identiska.
  // Grundraden och avståndet hör till maskinen, resten till trakten.
  const harl = ackordRader[0]?.harledning || [];
  const traktensTillagg = harl.filter(h =>
    h.belopp !== 0 && !h.etikett.startsWith('Grund') && h.etikett !== 'Avstånd');
  const attFordela = traktensTillagg.reduce((s, h) => s + h.belopp, 0);
  const fordelningsnot = harl.find(h => h.etikett.startsWith('Fördelning ändrad'));

  return (
    <>
      <h1 style={{ margin: '24px 0 0', fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em' }}>
        {d.objektnamn}
      </h1>
      <p style={{ margin: '8px 0 0', fontSize: 15, color: F.dampad }}>
        {d.bolag || '—'} · {d.avtalsform} · VO {d.vo_nummer}
        {d.rader.find(r => r.artikelnr === '8')?.benamning.replace('Kontraktsnr', ' · kontrakt') || ''}
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, margin: '28px 0 0', flexWrap: 'wrap' }}>
        <span style={{ ...TAL, fontSize: 76, fontWeight: 400, lineHeight: 0.9, letterSpacing: '-0.04em' }}>
          {nr(d.summa_kant)}
        </span>
        <div>
          <p style={{ margin: 0, fontSize: 20 }}>kr att fakturera</p>
          <p style={{ margin: '5px 0 0', fontSize: 15, color: F.dampad }}>
            {d.avrakningsdatum ? `Avslutad ${d.avrakningsdatum}` : 'Inte avräknad'}
            {d.rader_utan_pris > 0 && ` · ${d.rader_utan_pris} rader utan hämtat pris`}
          </p>
        </div>
      </div>

      {/* En uppställning per maskin */}
      <div style={{ display: 'flex', gap: 18, marginTop: 28, flexWrap: 'wrap' }}>
        {maskinRader.map(r => <Maskinkort key={r.radnr} r={r} />)}
      </div>

      {/* Traktens tillägg för sig — det hör till trakten, inte till en maskin */}
      {traktensTillagg.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <p style={{ margin: '0 0 10px 4px', fontSize: 13, color: F.dampad }}>
            Traktens tillägg — delas mellan maskinerna
          </p>
          <div style={{ background: F.kort, borderRadius: 14, padding: '20px 24px',
                        display: 'flex', flexDirection: 'column', gap: 10 }}>
            {traktensTillagg.map((h, i) => (
              <Prisrad key={i} etikett={h.etikett} belopp={h.belopp} dampad tecken />
            ))}
            <div style={{ height: 1, background: F.linje }} />
            <Prisrad etikett="Att fördela" belopp={attFordela} stor />
            {fordelningsnot && (
              <p style={{ margin: '2px 0 0', fontSize: 14, color: F.dampad }}>{fordelningsnot.etikett}</p>
            )}
          </div>
        </div>
      )}

      {/* Övriga rader */}
      {ovriga.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <p style={{ margin: '0 0 10px 4px', fontSize: 13, color: F.dampad }}>Övriga rader</p>
          <div style={{ background: F.kort, borderRadius: 14, overflow: 'hidden' }}>
            {ovriga.map((r, i) => {
              const pris = r.a_pris ?? r.a_pris_beraknat;
              return (
                <div key={r.radnr}>
                  {i > 0 && <div style={{ height: 1, background: F.linje, marginLeft: 24 }} />}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 16,
                                padding: '17px 24px', flexWrap: 'wrap' }}>
                    <span style={{ flexGrow: 1, minWidth: 160, fontSize: 16 }}>{r.benamning}</span>
                    <span style={{ ...TAL, fontSize: 15, color: F.dampad, minWidth: 90, textAlign: 'right' }}>
                      {r.antal == null ? '—' : kr2(r.antal)} {r.enhet === 'h' ? 'tim' : r.enhet || ''}
                    </span>
                    <span style={{ ...TAL, fontSize: 15, color: F.dampad, minWidth: 70, textAlign: 'right' }}>
                      {pris == null ? 'hämtas' : kr2(pris)}
                    </span>
                    <span style={{ ...TAL, fontSize: 16, minWidth: 100, textAlign: 'right' }}>
                      {pris != null && r.antal != null ? `${nr(pris * r.antal)} kr` : '—'}
                    </span>
                  </div>
                  {r.status !== 'klar' && (
                    <p style={{ margin: '-8px 24px 14px', fontSize: 14, color: F.varning }}>
                      {r.status === 'fel' ? `Går inte att prissätta: ${r.fel_kod}` : 'Väntar på leverantörsfaktura'}
                    </p>
                  )}
                  {!!r.harledning?.length && (
                    <p style={{ margin: '-8px 24px 14px', fontSize: 14, color: F.dampad }}>
                      {r.harledning.filter(h => h.belopp === 0).map(h => h.etikett).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Att titta på — ren text, ingen box */}
      {(d.hinder.length > 0 || d.noter.length > 0) && (
        <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <p style={{ margin: '0 0 0 4px', fontSize: 13, color: F.dampad }}>Att titta på</p>
          {d.hinder.map((h, i) => (
            <p key={`h${i}`} style={{ margin: 0, fontSize: 15, color: F.varning }}>{h}</p>
          ))}
          {d.noter.map((n, i) => (
            <p key={`n${i}`} style={{ margin: 0, fontSize: 15,
                                      color: n.niva === 'varning' ? F.text : F.dampad }}>{n.text}</p>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 32, flexWrap: 'wrap' }}>
        <button type="button" disabled
          style={{ fontFamily: SANS, fontSize: 15, padding: '0 26px', height: 48, border: 'none',
                   borderRadius: 24, background: F.accent, color: F.accentMork,
                   opacity: 0.4, cursor: 'default' }}>
          Markera som granskad
        </button>
        <span style={{ fontSize: 14, color: F.dampad }}>
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
  // Benämningen är "Skördning ackord Gigant" / "Skördning timpeng Gigant" —
  // maskinnamnet är resten efter de två första orden.
  const namn = r.benamning.split(' ').slice(2).join(' ') || r.benamning;

  return (
    <div style={{ flexGrow: 1, flexBasis: 300, minWidth: 260, background: F.kort,
                  borderRadius: 14, padding: '22px 24px',
                  display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={{ margin: 0, fontSize: 18 }}>{namn}</p>
        <p style={{ margin: '3px 0 0', fontSize: 14, color: F.dampad }}>
          {verb} · {r.kostnadsstalle ? `kostnadsställe ${r.kostnadsstalle}` : 'kostnadsställe saknas'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {r.delar_grundpris != null && (
          <Prisrad dampad belopp={r.delar_grundpris}
            etikett={arTimpeng ? 'Timpris' : (grund?.etikett.replace('Grund ', '').replace(/[()]/g, '') || 'Grundpris')} />
        )}
        {!arTimpeng && r.delar_andel != null && r.delar_andel !== 0 && (
          <Prisrad dampad tecken etikett="Andel av traktens tillägg" belopp={r.delar_andel} />
        )}
        {!arTimpeng && !!r.delar_avstand && (
          <Prisrad dampad tecken etikett="Skotningsavstånd" belopp={r.delar_avstand} />
        )}
      </div>

      <div style={{ height: 1, background: F.linje }} />
      <Prisrad etikett={arTimpeng ? 'Pris per timme' : 'Pris per m³fub'} belopp={pris} stor />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ ...TAL, flexGrow: 1, fontSize: 14, color: F.dampad }}>
          × {kr2(r.antal)} {arTimpeng ? 'tim' : 'm³fub'}
        </span>
        <span style={{ ...TAL, fontSize: 17 }}>
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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ flexGrow: 1, fontSize: 15, color: dampad ? F.dampad : F.text }}>{etikett}</span>
      <span style={{ ...TAL, fontSize: stor ? 22 : 15 }}>
        {belopp == null ? '—' : `${tecken && belopp > 0 ? '+' : ''}${kr2(belopp)}`}
      </span>
    </div>
  );
}
