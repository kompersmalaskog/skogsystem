'use client';

// HELA TRAKTEN — det föraren läser när han börjar på en trakt (Martin 2026-11-05: "så enkelt att ett barn förstår direkt", "allt utskrivet").
// FYRA FRÅGOR, uppifrån (Martin 2026-11-11, skissen "hela"): ALL information står kvar, bara dubbletterna är borta.
//   Om något händer   — larmkoordinaten, stor, och hur långt dit (fågelväg — appen ritar ingen väg dit).
//   Vad är farligt?   — Vidas faror, farorna på kartan, riskbedömningen och brandrisken. Starkast på sidan.
//   Vad ska du göra?  — Vidas text och texterna på trakten, inför jobbet, och det på kartan som inte ska sparas.
//   Vad ska sparas?   — certifieringen ALLTID (två rader "Evighetsträd 1 av 11", "Inte certifierad …" eller "Certifiering saknas"),
//                       skyddade områden och hänsynen på kartan.
//   På kartan står VARJE SORT som en rad med antalet ("Stenmur · 3"), med eller utan text — texten under (Martin 2026-11-12, Lidhem).
//   Sist: det som är kollat och i ordning som EN grå rad, Mer om trakten, "Börja köra".
// Dubbletter som tas bort: riskraden "Varning på kartan" när varningen redan står under farorna, och avläggets namn
// (Vidas kod, "inback skbv") på larmraden — namnet står kvar i "Om något händer".
// Ingen meningsrad med siffror, inget "1 med text": det som är skrivet står där. Ett tryck på en rad på kartan öppnar samma kort som på kartan.
// Ren presentation — sidan räknar, sparar kvittot och öppnar korten.

import React, { useMemo, useState } from 'react';
import MarkeringFoto from '@/app/planering/MarkeringFoto';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { SammanfattningRad } from '@/lib/klarTrakt';
import { harFoto, type KartMarkering, type OmKommentar, type TillForarenPost } from '@/lib/objektKort';
import { byggOmGrupper, objektTitel, typRadText, type TypRad } from '@/lib/omTrakten';
import type { Risk } from '@/lib/riskbedomning';
import type { CertLage, SkyddRad } from '@/lib/traktOversikt';
import { faroMarkeringar } from '@/lib/faroNummer';
import BrandriskRad from './BrandriskRad';
import LarmVy from './LarmVy';
import type { LarmVisning } from '@/lib/larmpunkter';
import { Gruppkort, Huvud, Pil, RadKnapp, Rubrik } from './infoDelar';
import { KommentarVisning } from './KommentarRuta';
import type { OmMiljoRad } from './OmTrakten';

export interface OversiktLarm { satt: boolean; koordinat: string; beskrivning: string; onVisa: () => void; visning?: LarmVisning; onVisaPlats?: (index: number) => void }

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
  /** Är trakten certifierad? Står ALLTID i "Vad ska sparas?" (Martin 2026-11-12: "det står ju inget om cert"). Saknas = som certifierad med `cert`. */
  certLage?: CertLage;
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
  /** En sort med flera på kartan ("Stenmur · 3"): samma typvy som i Om trakten — alla markeras på kartan. En enda öppnas med onOppna. */
  onSort?: (nyckel: string) => void;
  /** "Vad betyder kartan" — det som finns på trakten, med symbolernas betydelse. */
  onKarta?: () => void;
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

/** En sak på kartan med text: symbolen, vad det är, HELA texten, fotot. Hela raden öppnar kortet. */
function KartRad({ m, forsta, ny, ikon, objektId, onOppna, onFoto, nr }: { m: KartMarkering; forsta: boolean; ny: boolean; ikon: (m: KartMarkering) => React.ReactNode; objektId: string | null; onOppna: (m: KartMarkering) => void; onFoto: (src: string) => void; nr?: number }) {
  const texter = kommentarerFor(m);
  return (
    <div style={{ borderTop: forsta ? 'none' : `1px solid ${FARG.linje}`, display: 'flex', alignItems: 'stretch' }}>
      <button type="button" data-testid={`oversikt-kart-${m.id}`} onClick={() => onOppna(m)} className="press-row"
        style={{ flex: 1, minWidth: 0, minHeight: TRAFFYTA.primar, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m,
          background: 'transparent', border: 'none', color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
        {nr != null ? (
          // Samma nummer som på kartan (lib/faroNummer).
          <span data-testid="oversikt-faro-nr" style={{ flexShrink: 0, width: AVSTAND.xxl, height: AVSTAND.xxl, borderRadius: RADIE.cirkel, background: FARG.rod, color: FARG.text, ...TYP.listtitel, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{nr}</span>
        ) : <span style={{ flexShrink: 0, display: 'inline-flex' }}>{ikon(m)}</span>}
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
  // Farorna i samma ordning och med samma nummer som på kartan (lib/faroNummer).
  const faroMark = useMemo(() => faroMarkeringar(p.markeringar), [p.markeringar]);
  const ovrigaRader: TypRad[] = grupper.filter((g) => g.grupp !== 'faror' && g.grupp !== 'vida').flatMap((g) => g.rader);
  const harText = (m: KartMarkering) => kommentarerFor(m).length > 0 || harFoto(m);
  // Certifieringen som rader: "Evighetsträd 1 av 11". Utan krav: bara antalet.
  const certLage: CertLage = p.certLage ?? (p.cert ? { lage: 'cert', namn: '' } : { lage: 'okand', namn: '' });
  const certifierad = certLage.lage === 'cert';
  const certRader = certifierad && p.cert ? p.miljo : [];
  // VARJE SORT PÅ KARTAN, med eller utan text (Martin 2026-11-12: "symbolerna som inte har text vill man ju se, som stenmuren").
  // En rad per sort med antalet; texterna står under. En sort med EN markering som har text är bara den raden (inget "Avlägg · 1 st" ovanför).
  // Högstubbar/evighetsträd står i certifieringsraderna när trakten är certifierad; ytorna (traktdelar, egna områden) står under "Vad ska du göra?" som text.
  const sorter = ovrigaRader.filter((r) => !r.ytaTyp && !(certifierad && p.cert && r.nyckel.startsWith('miljo:')) && (r.miljo ? r.miljo.satta > 0 : r.markeringar.length > 0));
  const sparaSorter = sorter.filter((r) => r.grupp === 'hansyn');
  const goraSorter = sorter.filter((r) => r.grupp !== 'hansyn');
  // Riskraden "Varning" säger bara att det finns en varning på kartan — den står redan under farorna.
  const risker = (p.risker ?? []).filter((r) => !(r.nyckel === 'varning' && faroMark.length > 0));
  const harFaror = p.faror.length > 0 || faroMark.length > 0 || risker.length > 0;
  const harGora = p.tillForaren.length > 0 || p.helaTrakten.length > 0 || p.infor.length > 0 || goraSorter.length > 0;
  // Det som är kollat och i ordning: EN grå rad längst ner.
  const kollat = [
    !harFaror && (p.risker ? 'inga faror eller risker' : 'inga faror utmärkta'),
    p.skydd.lage === 'inga' && 'inga skyddade områden',
  ].filter(Boolean) as string[];

  const last = async () => {
    if (p.last) { p.onStang(); return; }
    setSparar(true); setFel(false);
    const ok = await p.onLast();
    setSparar(false);
    if (ok) p.onStang(); else setFel(true);
  };

  if (larmVy && p.larm?.satt) {
    return <LarmVy koordinat={p.larm.koordinat} beskrivning={p.larm.beskrivning} onVisa={p.larm.onVisa} visning={p.larm.visning} onVisaPlats={p.larm.onVisaPlats} onTillbaka={() => setLarmVy(false)} onStang={p.onStang} />;
  }

  const kartRad = (m: KartMarkering, i: number, forstaOffset = 0) => (
    <KartRad key={m.id} m={m} forsta={forstaOffset === 0 && i === 0} ny={p.nya.has(m.id)} ikon={p.ikon} objektId={p.objektId} onOppna={p.onOppna} onFoto={p.onFoto} />
  );
  const rad = (key: string, i: number, barn: React.ReactNode, testid?: string) => (
    <div key={key} data-testid={testid} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>{barn}</div>
  );
  // En sort: "Stenmur · 3" och under den det som är skrivet. Hela raden visar sorten på kartan (en ensam öppnas direkt).
  const sortBlock = (r: TypRad, forsta: boolean) => {
    const medText = r.markeringar.filter(harText);
    if (!r.miljo && r.markeringar.length === 1 && medText.length === 1) return kartRad(medText[0], forsta ? 0 : 1);
    const m0 = r.markeringar[0];
    return (
      <div key={r.nyckel} data-testid={`oversikt-sort-${r.nyckel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
        <button type="button" onClick={() => (r.markeringar.length === 1 ? p.onOppna(m0) : p.onSort?.(r.nyckel))} className="press-row"
          style={{ width: '100%', minHeight: TRAFFYTA.primar, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none',
            borderTop: forsta ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
          {m0 && <span style={{ flexShrink: 0, display: 'inline-flex' }}>{p.ikon(m0)}</span>}
          <span style={{ ...TYP.listtitel, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{typRadText(r)}</span>
          {r.markeringar.some((m) => p.nya.has(m.id)) && <Nytt />}
          <Pil />
        </button>
        {medText.map((m) => kartRad(m, 1))}
      </div>
    );
  };
  const larmUnder = !p.larm ? '' : !p.larm.satt ? 'Larmkoordinat saknas – fråga planeraren'
    : p.larm.visning?.valjSjalv ? `${p.larm.visning.platser.length} larmplatser – välj den närmaste`
    : [p.larm.visning?.narmast ?? p.larm.visning?.fagelvag, 'Tryck så visas den på kartan'].filter(Boolean).join(' · ');

  return (
    <>
      <Huvud titel={p.namn} undertitel={p.under || undefined} onStang={p.onStang} />
      <div data-testid="oversikt-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>

        {/* 1. OM NÅGOT HÄNDER — först, alltid. Koordinaten stort, avståndet i fågelväg. */}
        {p.larm && (
          <section data-testid="oversikt-larm">
            <Rubrik farg={FARG.rod}>Om något händer – ring 112</Rubrik>
            <Gruppkort>
              <RadKnapp ikon="emergency" farg={FARG.rod} forstaRad testid="oversikt-larm-rad"
                etikett={p.larm.satt && p.larm.koordinat
                  ? <span data-testid="oversikt-larm-koordinat" style={{ ...TYP.listtitel, color: FARG.text, fontVariantNumeric: 'tabular-nums' }}>{p.larm.koordinat}</span>
                  : <span style={{ color: FARG.text }}>Larmkoordinat</span>}
                under={larmUnder}
                onTryck={p.larm.satt ? () => setLarmVy(true) : () => {}} pil={p.larm.satt} />
            </Gruppkort>
          </section>
        )}

        {/* 2. VAD ÄR FARLIGT? — Vidas faror, farorna på kartan, riskbedömningen, brandrisken. */}
        {(harFaror || p.brand) && (
          <section data-testid="oversikt-faror">
            {harFaror && <Rubrik farg={FARG.rod}>Vad är farligt?</Rubrik>}
            {harFaror && (
              <Gruppkort>
                {p.faror.map((f, i) => (
                  <div key={`vida-${f}`} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.rod }}>warning</span>
                    <span style={{ ...TYP.listtitel, color: FARG.rod, overflowWrap: 'anywhere' }}>{f}</span>
                  </div>
                ))}
                {faroMark.map((m, i) => (
                  <KartRad key={m.id} m={m} forsta={p.faror.length === 0 && i === 0} ny={p.nya.has(m.id)} ikon={p.ikon} objektId={p.objektId} onOppna={p.onOppna} onFoto={p.onFoto} nr={i + 1} />
                ))}
                {risker.length > 0 && (
                  <div data-testid="oversikt-risker" style={{ borderTop: p.faror.length + faroMark.length === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                    {risker.map((r, i) => rad(r.nyckel, i, (
                      <>
                        <div style={{ ...TYP.listtitel, overflowWrap: 'anywhere' }}>{r.risk}</div>
                        {r.atgard.trim() && <div style={{ ...TYP.text, color: FARG.text2, overflowWrap: 'anywhere' }}>{r.atgard}</div>}
                      </>
                    )))}
                  </div>
                )}
              </Gruppkort>
            )}
            {p.brand && <div style={{ marginTop: harFaror ? AVSTAND.s : 0 }}><BrandriskRad lat={p.brand.lat} lng={p.brand.lng} onOppna={p.onBrand} /></div>}
          </section>
        )}

        {/* 3. VAD SKA DU GÖRA? — texterna i sin helhet, inför jobbet, och det på kartan som har text. */}
        {harGora && (
          <section data-testid="oversikt-gora" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            <Rubrik>Vad ska du göra?</Rubrik>
            {(p.tillForaren.length > 0 || p.helaTrakten.length > 0) && (
              <div data-testid="oversikt-veta" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
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
            )}
            {p.infor.length > 0 && (
              <div data-testid="oversikt-infor">
                <Gruppkort>
                  {p.infor.map((r, i) => (
                    <div key={r.id} data-testid={`oversikt-infor-${r.id}`} style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'baseline', padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                      <span style={{ ...TYP.text, color: FARG.text2, flexShrink: 0 }}>{r.etikett}</span>
                      <span style={{ ...TYP.listtitel, flex: 1, minWidth: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>{r.text}</span>
                    </div>
                  ))}
                </Gruppkort>
              </div>
            )}
            {goraSorter.length > 0 && (
              <div data-testid="oversikt-pa-kartan">
                <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>På kartan · tryck så visas platsen</div>
                <Gruppkort>{goraSorter.map((r, i) => sortBlock(r, i === 0))}</Gruppkort>
              </div>
            )}
          </section>
        )}

        {/* 4. VAD SKA SPARAS? — certifieringen (ALLTID en rad), skyddade områden, hänsynen på kartan. */}
        <section data-testid="oversikt-spara">
          <Rubrik farg={FARG.gron}>Vad ska sparas?</Rubrik>
          <Gruppkort>
            {certRader.map((m, i) => (
              <RadKnapp key={m.id} ikon={m.uppfyllt ? 'check_circle' : 'park'} farg={m.uppfyllt ? FARG.gron : FARG.orange} forstaRad={i === 0} testid={`oversikt-cert-${m.id}`}
                etikett={<span style={{ color: FARG.text }}>{m.krav != null ? `${m.namn} ${m.antal} av ${m.krav}` : `${m.namn} ${m.antal}`}</span>}
                under={i === 0 && p.onCert ? 'Vad certifieringen kräver' : undefined}
                onTryck={p.onCert ?? (() => {})} pil={!!p.onCert} />
            ))}
            {certifierad && p.cert && p.miljo.length === 0 && (
              <RadKnapp ikon={p.cert.klar ? 'check_circle' : 'park'} farg={p.cert.klar ? FARG.gron : FARG.orange} forstaRad testid="oversikt-cert-rad"
                etikett={<span style={{ color: FARG.text }}>{p.cert.text}</span>} onTryck={p.onCert ?? (() => {})} pil={!!p.onCert} />
            )}
            {certifierad && !p.cert && (
              <RadKnapp ikon="park" forstaRad testid="oversikt-cert-rad"
                etikett={<span style={{ color: FARG.text }}>{certLage.namn ? `${certLage.namn}-certifierad` : 'Certifierad'}</span>}
                under="Kravet på högstubbar och evighetsträd kunde inte räknas – arealen saknas" onTryck={p.onCert ?? (() => {})} pil={!!p.onCert} />
            )}
            {certLage.lage === 'ingen' && (
              <div data-testid="oversikt-cert-ingen" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px` }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.text2, width: AVSTAND.xxl, textAlign: 'center' }}>park</span>
                <span style={{ ...TYP.text, color: FARG.text, overflowWrap: 'anywhere' }}>Inte certifierad – inga krav på högstubbar och evighetsträd</span>
              </div>
            )}
            {certLage.lage === 'okand' && (
              <div data-testid="oversikt-cert-okand" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px` }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.orange, width: AVSTAND.xxl, textAlign: 'center' }}>help</span>
                <span style={{ ...TYP.text, color: FARG.orange, overflowWrap: 'anywhere' }}>Certifiering saknas – fråga planeraren</span>
              </div>
            )}
            {p.skydd.lage === 'finns' && (
              <div data-testid="oversikt-skydd" style={{ borderTop: `1px solid ${FARG.linje}` }}>
                {p.skydd.rader.map((r, i) => rad(`${r.namn}-${i}`, i, (
                  <>
                    <div style={{ ...TYP.listtitel, overflowWrap: 'anywhere' }}>{r.namn}</div>
                    {r.text && <div style={{ ...TYP.text, color: FARG.text2, overflowWrap: 'anywhere' }}>{r.text}</div>}
                  </>
                )))}
              </div>
            )}
            {sparaSorter.length > 0 && (
              <div data-testid="oversikt-spara-kartan" style={{ borderTop: `1px solid ${FARG.linje}` }}>
                {sparaSorter.map((r, i) => sortBlock(r, i === 0))}
              </div>
            )}
          </Gruppkort>
        </section>

        {/* Skyddade områden aldrig kontrollerade: det sägs, aldrig "inga". */}
        {p.skydd.lage === 'inte' && <div data-testid="oversikt-skydd-okant" style={{ ...TYP.text, color: FARG.orange }}>Skyddade områden är inte kontrollerade – fråga planeraren</div>}

        {/* Det som är kollat och i ordning: EN grå rad. */}
        {kollat.length > 0 && (
          <div data-testid="oversikt-kollat" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.text, color: FARG.text2 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.text2 }}>check_circle</span>
            <span style={{ overflowWrap: 'anywhere' }}>Kollat: {kollat.join(' · ')}</span>
          </div>
        )}

        <Gruppkort>
          {p.onKarta && <RadKnapp ikon="map" forstaRad testid="oversikt-karta" etikett="Vad betyder kartan" onTryck={p.onKarta} />}
          <RadKnapp ikon="more_horiz" forstaRad={!p.onKarta} testid="oversikt-mer" etikett="Mer om trakten" under="Dokument, inställningar" onTryck={p.onMer} />
        </Gruppkort>
      </div>
      <div style={{ flexShrink: 0, padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
        {fel && <div data-testid="oversikt-fel" style={{ ...TYP.text, color: FARG.orange, marginBottom: AVSTAND.s }}>Kunde inte spara – försök igen</div>}
        <button type="button" data-testid="oversikt-last" onClick={() => { void last(); }} disabled={sparar} className="press-scale"
          style={{ ...KNAPP.primar, width: '100%', minHeight: TRAFFYTA.primar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', opacity: sparar ? 0.6 : 1 }}>
          {sparar ? 'Sparar …' : 'Börja köra'}
        </button>
      </div>
    </>
  );
}
