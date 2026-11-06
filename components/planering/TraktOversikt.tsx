'use client';

// HELA TRAKTEN — det föraren läser när han börjar på en trakt (Martin 2026-11-05: "så enkelt att ett barn förstår direkt", "allt utskrivet").
// EN sida, uppifrån, i den ordning det är viktigt:
//   Larmkoordinat (om något händer) · Faror (röd) · Risker · Skyddade områden · Brandrisk · Certifieringen (det ni satt ut, i ord)
//   · Det här ska du veta (Vidas text + texterna på trakten, i sin helhet) · Inför jobbet (bara det som avviker)
//   · På kartan (EN rad per sak med text: symbolen, vad det är, HELA texten, fotot) · Utan text (en rad) · Mer om trakten
//   · "Jag har läst allt" (första gången och när något ändrats) / "Till kartan".
// Ingen meningsrad med siffror, inget "1 med text": det som är skrivet står där. Ett tryck på en rad på kartan öppnar samma kort som på kartan.
// Ren presentation — sidan räknar, sparar kvittot och öppnar korten.

import React, { useMemo, useState } from 'react';
import MarkeringFoto from '@/app/planering/MarkeringFoto';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { SammanfattningRad } from '@/lib/klarTrakt';
import { harFoto, type KartMarkering, type OmKommentar, type TillForarenPost } from '@/lib/objektKort';
import { byggOmGrupper, objektTitel, type TypRad } from '@/lib/omTrakten';
import type { Risk } from '@/lib/riskbedomning';
import { utanTextRad, type SkyddRad } from '@/lib/traktOversikt';
import BrandriskRad from './BrandriskRad';
import LarmVy from './LarmVy';
import { Gruppkort, Huvud, Pil, RadKnapp, Rubrik } from './infoDelar';
import { KommentarVisning } from './KommentarRuta';
import type { OmMiljoRad } from './OmTrakten';

export interface OversiktLarm { satt: boolean; koordinat: string; beskrivning: string; onVisa: () => void }

export interface TraktOversiktProps {
  namn: string;
  /** "Slutavverkning · PEFC · 2,5 ha" (lib/traktOversikt.oversiktUnder). */
  under: string;
  /** Larmkoordinaten — ALLTID först (Martin 2026-11-05). null = sidan vet inte. */
  larm: OversiktLarm | null;
  /** Vidas farliga linjer (kraftledning) — de egna farorna räknas ur markeringarna. */
  faror: string[];
  /** Planerarens riskbedömning (lib/riskbedomning). null = inte gjord. */
  risker: Risk[] | null;
  /** Traktanalysen: vattenskydd, nyckelbiotop, fornlämning … (lib/traktOversikt.skyddadeOmraden). */
  skydd: { lage: 'inte' | 'inga' | 'finns'; rader: SkyddRad[] };
  brand: { lat: number; lng: number } | null;
  onBrand: () => void;
  /** "PEFC: alla 26 evighetsträd och 8 högstubbar är utsatta – spara dem." (lib/traktOversikt.certRad). */
  cert: { text: string; klar: boolean } | null;
  onCert?: () => void;
  tillForaren: TillForarenPost[];
  /** Kommentarerna på själva trakten (traktdelar, egna områden) — de gäller hela trakten. */
  helaTrakten: OmKommentar[];
  /** Bara det som avviker (lib/traktOversikt.inforJobbet). */
  infor: SammanfattningRad[];
  markeringar: KartMarkering[];
  miljo: OmMiljoRad[];
  ikon: (m: KartMarkering) => React.ReactNode;
  objektId: string | null;
  /** Markeringar som är nya sedan föraren läste trakten (id). */
  nya: ReadonlySet<string>;
  /** Texter som är nya: 'vida' och kartkommentarernas id. */
  nyaTexter: ReadonlySet<string>;
  /** Har föraren läst exakt det här? false = knappen är "Jag har läst allt" och ✕ sparar inget. */
  last: boolean;
  /** "Jag har läst allt" → true när kvittot sparats. */
  onLast: () => Promise<boolean>;
  /** En rad på kartan: samma kort som när man trycker på symbolen. */
  onOppna: (m: KartMarkering) => void;
  onFoto: (src: string) => void;
  /** "Mer om trakten" — det vanliga kortet (dokument, kartans färger, Mer). */
  onMer: () => void;
  onStang: () => void;
}

const kommentarerFor = (m: KartMarkering): OmKommentar[] => {
  const komm = (m.comment ?? '').trim();
  return m.kommentarer ?? (komm ? [{ id: 'aldre', text: komm, forfattare: null }] : []);
};

const Nytt = () => (
  <span data-testid="oversikt-nytt" style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, color: FARG.bla, flexShrink: 0 }}>
    <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: FARG.bla }} />Nytt
  </span>
);

const Bock = ({ text, testid }: { text: string; testid: string }) => (
  <div data-testid={testid} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.text, color: FARG.text2 }}>
    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.gron }}>check_circle</span>{text}
  </div>
);

/** En sak på kartan med text: symbolen, vad det är, HELA texten, fotot. Hela raden öppnar kortet. */
function KartRad({ m, forsta, ny, ikon, objektId, onOppna, onFoto }: { m: KartMarkering; forsta: boolean; ny: boolean; ikon: (m: KartMarkering) => React.ReactNode; objektId: string | null; onOppna: (m: KartMarkering) => void; onFoto: (src: string) => void }) {
  const texter = kommentarerFor(m);
  return (
    <div style={{ borderTop: forsta ? 'none' : `1px solid ${FARG.linje}`, display: 'flex', alignItems: 'stretch' }}>
      <button type="button" data-testid={`oversikt-kart-${m.id}`} onClick={() => onOppna(m)} className="press-row"
        style={{ flex: 1, minWidth: 0, minHeight: TRAFFYTA.primar, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m,
          background: 'transparent', border: 'none', color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
        <span style={{ flexShrink: 0, display: 'inline-flex' }}>{ikon(m)}</span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
            <span style={{ ...TYP.meta, color: FARG.text2, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{objektTitel(m)}</span>
            {ny && <Nytt />}
          </span>
          {texter.map((k) => (
            <span key={k.id} data-testid="oversikt-kart-text" style={{ ...TYP.kommentar, color: FARG.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{k.text}</span>
          ))}
        </span>
        <span style={{ alignSelf: 'center', flexShrink: 0 }}><Pil /></span>
      </button>
      {harFoto(m) && (
        <span data-testid="oversikt-kart-foto" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', padding: `${AVSTAND.s}px ${AVSTAND.m}px ${AVSTAND.s}px 0` }}>
          <MarkeringFoto lokal={m.fotoVantar && objektId ? { objektId, markerId: m.id } : null} photoPath={m.photoPath} photoData={m.photoData} photoTs={m.photoTs} alt={`Foto: ${m.namn}`} onOpen={onFoto}
            style={{ width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xxl + AVSTAND.s, objectFit: 'cover', borderRadius: RADIE.rad, display: 'block' }} />
        </span>
      )}
    </div>
  );
}

export default function TraktOversikt(p: TraktOversiktProps) {
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);
  // Larmraden öppnar "Om något händer" i samma panel, med "‹ Hela trakten" tillbaka (Martin 2026-11-05).
  const [larmVy, setLarmVy] = useState(false);
  const grupper = useMemo(
    () => byggOmGrupper(p.markeringar, null, p.miljo.map((m) => ({ id: m.id as 'hogstubbar' | 'evighetstrad', namn: m.namn, antal: m.antal, krav: m.krav, uppfyllt: m.uppfyllt })), []),
    [p.markeringar, p.miljo],
  );
  const faroMark = (grupper.find((g) => g.grupp === 'faror')?.rader ?? []).flatMap((r) => r.markeringar);
  const ovrigaRader: TypRad[] = grupper.filter((g) => g.grupp !== 'faror' && g.grupp !== 'vida').flatMap((g) => g.rader);
  // Allt med text, i listans ordning (en markering = en rad, aldrig "1 med text").
  const medText = ovrigaRader.flatMap((r) => r.markeringar).filter((m) => kommentarerFor(m).length > 0 || harFoto(m));
  // Utan text: sorterna, med antalet som INTE har text. Högstubbar/evighetsträd står i certifieringsraden när den finns.
  const utan = utanTextRad(ovrigaRader
    .filter((r) => !(p.cert && r.nyckel.startsWith('miljo:')) && !r.ytaTyp)
    .map((r) => ({ namn: r.namn, antal: r.miljo ? r.miljo.satta : r.markeringar.filter((m) => !(kommentarerFor(m).length > 0 || harFoto(m))).length })));
  const harFaror = p.faror.length > 0 || faroMark.length > 0;
  const harRisker = !!p.risker && p.risker.length > 0;

  const last = async () => {
    if (p.last) { p.onStang(); return; }
    setSparar(true); setFel(false);
    const ok = await p.onLast();
    setSparar(false);
    if (ok) p.onStang(); else setFel(true);
  };

  if (larmVy && p.larm?.satt) {
    return <LarmVy koordinat={p.larm.koordinat} beskrivning={p.larm.beskrivning} onVisa={p.larm.onVisa} onTillbaka={() => setLarmVy(false)} onStang={p.onStang} />;
  }

  return (
    <>
      <Huvud titel={p.namn} undertitel={p.under || undefined} onStang={p.onStang} />
      <div data-testid="oversikt-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>

        {/* 1. LARMKOORDINATEN — först, alltid. */}
        {p.larm && (
          <section data-testid="oversikt-larm">
            <Gruppkort>
              <RadKnapp ikon="emergency" farg={FARG.rod} forstaRad testid="oversikt-larm-rad"
                etikett="Om något händer – ring 112"
                under={p.larm.satt ? [p.larm.koordinat, p.larm.beskrivning].filter(Boolean).join(' · ') : 'Larmkoordinat saknas – fråga planeraren'}
                onTryck={p.larm.satt ? () => setLarmVy(true) : () => {}} pil={p.larm.satt} />
            </Gruppkort>
          </section>
        )}

        {/* 2. FAROR (röd) — en rad per fara med sin text; tryck = kortet på kartan. */}
        {harFaror && (
          <section data-testid="oversikt-faror">
            <Rubrik farg={FARG.rod}>Faror</Rubrik>
            <Gruppkort>
              {p.faror.map((f, i) => (
                <div key={`vida-${f}`} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.rod }}>warning</span>
                  <span style={{ ...TYP.listtitel, color: FARG.rod, overflowWrap: 'anywhere' }}>{f}</span>
                </div>
              ))}
              {faroMark.map((m, i) => (
                <KartRad key={m.id} m={m} forsta={p.faror.length === 0 && i === 0} ny={p.nya.has(m.id)} ikon={p.ikon} objektId={p.objektId} onOppna={p.onOppna} onFoto={p.onFoto} />
              ))}
            </Gruppkort>
          </section>
        )}

        {/* 3. RISKER — planerarens riskbedömning: risk och vad man gör. */}
        {harRisker && (
          <section data-testid="oversikt-risker">
            <Rubrik>Risker</Rubrik>
            <Gruppkort>
              {p.risker!.map((r, i) => (
                <div key={r.nyckel} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                  <div style={{ ...TYP.listtitel, overflowWrap: 'anywhere' }}>{r.risk}</div>
                  {r.atgard.trim() && <div style={{ ...TYP.text, color: FARG.text2, overflowWrap: 'anywhere' }}>{r.atgard}</div>}
                </div>
              ))}
            </Gruppkort>
          </section>
        )}

        {/* 4. SKYDDADE OMRÅDEN — bara det som hittades. Aldrig "inget hittat" om analysen inte körts. */}
        {p.skydd.lage === 'finns' && (
          <section data-testid="oversikt-skydd">
            <Rubrik farg={FARG.orange}>Skyddade områden</Rubrik>
            <Gruppkort>
              {p.skydd.rader.map((r, i) => (
                <div key={`${r.namn}-${i}`} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                  <div style={{ ...TYP.listtitel, overflowWrap: 'anywhere' }}>{r.namn}</div>
                  {r.text && <div style={{ ...TYP.text, color: FARG.text2, overflowWrap: 'anywhere' }}>{r.text}</div>}
                </div>
              ))}
            </Gruppkort>
          </section>
        )}

        {/* Det som är kontrollerat och inte hittat: EN rad, så han vet att det är kollat. */}
        {(!harFaror || (p.risker && !harRisker) || p.skydd.lage !== 'finns') && (
          <div data-testid="oversikt-kollat" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            {!harFaror && <Bock testid="oversikt-inga-faror" text="Inga faror utmärkta" />}
            {p.risker && !harRisker && <Bock testid="oversikt-inga-risker" text="Inga särskilda risker" />}
            {p.skydd.lage === 'inga' && <Bock testid="oversikt-inga-skydd" text="Inga skyddade områden (vattenskydd, nyckelbiotop, fornlämning …)" />}
            {p.skydd.lage === 'inte' && <div data-testid="oversikt-skydd-okant" style={{ ...TYP.text, color: FARG.orange }}>Skyddade områden är inte kontrollerade – fråga planeraren</div>}
          </div>
        )}

        {/* 5. BRANDRISK — bara klass 3 eller högre (raden visar sig själv). */}
        {p.brand && <BrandriskRad lat={p.brand.lat} lng={p.brand.lng} onOppna={p.onBrand} />}

        {/* 6. CERTIFIERINGEN — det ni redan satt ut, i ord. */}
        {p.cert && (
          <section data-testid="oversikt-cert">
            <Gruppkort>
              <RadKnapp ikon={p.cert.klar ? 'check_circle' : 'park'} farg={p.cert.klar ? FARG.gron : FARG.orange} forstaRad testid="oversikt-cert-rad"
                etikett={p.cert.text} under={p.onCert ? 'Vad certifieringen kräver' : undefined}
                onTryck={p.onCert ?? (() => {})} pil={!!p.onCert} />
            </Gruppkort>
          </section>
        )}

        {/* 7. DET HÄR SKA DU VETA — Vidas text och texterna på trakten, i sin helhet. */}
        {(p.tillForaren.length > 0 || p.helaTrakten.length > 0) && (
          <section data-testid="oversikt-veta">
            <Rubrik>Det här ska du veta</Rubrik>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {p.tillForaren.map((t) => {
                const vida = t.id === 'vida';
                return (
                  <div key={t.id} data-testid={`oversikt-post-${t.id}`}>
                    {p.nyaTexter.has(t.id) && <div style={{ marginBottom: AVSTAND.xs }}><Nytt /></div>}
                    <KommentarVisning vida={vida} etikett={vida ? undefined : `Hela trakten · ${t.avsandare}`} vidaEtikett="Vida" text={t.text} meningar={vida} struket={t.struket} onVaxla={t.onVaxla} strykFel={t.strykFel} />
                  </div>
                );
              })}
              {p.helaTrakten.map((k) => (
                <div key={k.id} data-testid="oversikt-trakten-text">
                  {p.nyaTexter.has(k.id) && <div style={{ marginBottom: AVSTAND.xs }}><Nytt /></div>}
                  <KommentarVisning etikett={k.forfattare ? `Trakten · ${k.forfattare}` : 'Trakten'} text={k.text} meningar={false} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 8. INFÖR JOBBET — bara det som avviker. */}
        {p.infor.length > 0 && (
          <section data-testid="oversikt-infor">
            <Rubrik>Inför jobbet</Rubrik>
            <Gruppkort>
              {p.infor.map((r, i) => (
                <div key={r.id} data-testid={`oversikt-infor-${r.id}`} style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'baseline', padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                  <span style={{ ...TYP.text, color: FARG.text2, flexShrink: 0 }}>{r.etikett}</span>
                  <span style={{ ...TYP.listtitel, flex: 1, minWidth: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>{r.text}</span>
                </div>
              ))}
            </Gruppkort>
          </section>
        )}

        {/* 9. PÅ KARTAN — en rad per sak med text, HELA texten. Tryck = kartan visar platsen och kortet öppnas. */}
        {medText.length > 0 && (
          <section data-testid="oversikt-pa-kartan">
            <Rubrik>På kartan · tryck så visas platsen</Rubrik>
            <Gruppkort>
              {medText.map((m, i) => (
                <KartRad key={m.id} m={m} forsta={i === 0} ny={p.nya.has(m.id)} ikon={p.ikon} objektId={p.objektId} onOppna={p.onOppna} onFoto={p.onFoto} />
              ))}
            </Gruppkort>
          </section>
        )}

        {/* 10. UTAN TEXT — en rad. */}
        {utan && (
          <section data-testid="oversikt-utan-text">
            <Rubrik>Utan text</Rubrik>
            <div style={{ ...TYP.text, color: FARG.text2, overflowWrap: 'anywhere' }}>{utan}</div>
          </section>
        )}

        <Gruppkort>
          <RadKnapp ikon="more_horiz" forstaRad testid="oversikt-mer" etikett="Mer om trakten" under="Dokument, kartans färger, inställningar" onTryck={p.onMer} />
        </Gruppkort>
      </div>
      <div style={{ flexShrink: 0, padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
        {fel && <div data-testid="oversikt-fel" style={{ ...TYP.text, color: FARG.orange, marginBottom: AVSTAND.s }}>Kunde inte spara – försök igen</div>}
        <button type="button" data-testid="oversikt-last" onClick={() => { void last(); }} disabled={sparar} className="press-scale"
          style={{ ...KNAPP.primar, width: '100%', minHeight: TRAFFYTA.primar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', opacity: sparar ? 0.6 : 1 }}>
          {p.last ? 'Till kartan' : sparar ? 'Sparar …' : 'Jag har läst allt'}
        </button>
      </div>
    </>
  );
}
