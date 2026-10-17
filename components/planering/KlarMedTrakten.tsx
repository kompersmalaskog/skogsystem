'use client';

// "KLAR MED TRAKTEN?" (tavla 34): planerarens färdigplanering. Appen har fyllt i det den kan; planeraren tittar, rättar och svarar på det appen inte kan veta.
//
//   1. APPEN HAR FYLLT I   avlägg · basväg · bärighet · terräng · skotningsavstånd · skördare · skotare · prognos      (orange = kvar)
//   2. HAR DU …            sex frågor, alltid ställda                                                                   (obesvarad = kvar)
//   3. MARKÄGARE & ÖVRIGT  ved · band · breddat · konfiguration … (vanligen "Nej", grått, räknas aldrig)
//   Längst ner: Klar för maskin (grå + "Kvar: …" / grön) och Fortsätter en annan dag.
//
// Ett tryck på en rad öppnar redigeringen på plats — ingen ny sida, ingen modal. KLAR FÖR MASKIN SPÄRRAR ALDRIG: den visar vad som är kvar, men går att trycka.
// Ren presentation: sidan räknar (lib/klarTrakt) och sparar; kortet ritar och säger vad som trycktes.

import React, { useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import {
  BARIGHET_VAL, HAR_DU_FRAGOR, SKOTNINGSAVSTAND_VAL, TERRANG_VAL, utforareLage,
  type HarDuId, type HarDuSvar, type HarDuSvarVarde, type KlarStatus, type Post, type PostId, type UtforareVal, type Varning, type VedDetaljer,
} from '@/lib/klarTrakt';
import { Gruppkort, Huvud, Pil, Rubrik } from './infoDelar';
import { Etikett, Falt, Val } from './klarDelar';
import KlarVed from './KlarVed';

/** varning = skälet till att maskinen inte borde stå här (såld, klarar inte trakttypen) — den visas, göms aldrig */
export interface MaskinAlternativ { id: string; namn: string; varning?: string }

export interface KlarPatch {
  barighet?: string | null; terrang?: string | null; skotningsavstand?: string | null;
  skordare?: UtforareVal; skotare?: UtforareVal;
  skordareTimmar?: string; skotareTimmar?: string; volym?: string; areal?: string; medelstam?: string;
  basvagKravs?: boolean; basvagTimmar?: string;
  bandSkordare?: boolean; bandParSkordare?: string | null; bandSkotare?: boolean; bandParSkotare?: string | null;
  breddat?: boolean; konfiguration?: string; risDirekt?: boolean; extraVagn?: boolean;
  trailerIn?: boolean; trailerKommentar?: string; manuellFallning?: boolean; manuellFallningText?: string; ved?: boolean;
}

/** En maskins del av prognosen: G15-timmar (fältets värde — det skrivna, annars förslaget) och det som hör till det. */
export interface MaskinPrognos {
  /** fältets värde i G15-tim. Tomt = varken skrivet eller något förslag. */
  tim: string;
  /** förslaget ur uppmätt utfall: talet och metaraden om källan + det uppmätta felet. null = inget förslag. */
  forslag: { g15: number; kalla: string } | null;
  /** varför förslag saknas (visas orange) — null när det finns ett förslag */
  saknas: string | null;
  /** fältet avviker från förslaget */
  andrad: boolean;
  /** m³fub per G15-timme = volym / fältets tim. Uträknad, aldrig ett eget fält. null = något saknas. */
  prestation: number | null;
}

export interface KlarMedTraktenProps {
  namn: string;
  status: KlarStatus;
  /** objektets status: 'oplanerad' | 'planerad' … — styr knappen längst ner */
  objektStatus: string;
  /** klar_skickad_timestamp (ISO) — när trakten gjordes klar för maskin */
  klarSkickadAt: string | null;
  basvag: { texter: string[]; kravs: boolean | null; timmar: string };
  barighet: string | null; terrang: string | null; skotningsavstand: string | null;
  skordare: UtforareVal; skotare: UtforareVal;
  maskiner: { skordare: MaskinAlternativ[]; skotare: MaskinAlternativ[] };
  prognos: {
    volym: string; areal: string; medelstam: string;
    skordare: MaskinPrognos; skotare: MaskinPrognos;
    /** förutsättningarna i klartext: "Band skotare", "Breddat lastrede", "Medel skotningsavstånd" … */
    forutsattningar: string[];
    godkandAv: string | null; godkandAt: string | null;
  };
  harDu: HarDuSvar;
  varningar: Varning[];
  /** medarbetar-id → förnamn (för "Svarat av …"); null = okänd */
  avNamn: (id: string | null) => string | null;
  ovrigt: {
    ved: boolean; vedText: string;
    bandSkordare: boolean | null; bandParSkordare: string | null; bandSkotare: boolean | null; bandParSkotare: string | null;
    breddat: boolean; konfiguration: string;
    /** konfiguration (bred/smal) gäller bara Elephant King (A110148) — som i den gamla Fakta-fliken */
    visaKonfiguration: boolean;
    risDirekt: boolean; extraVagn: boolean;
    trailerIn: boolean; trailerKommentar: string; manuellFallning: boolean; manuellFallningText: string;
  };
  ved: VedDetaljer;
  /** objekt.info_anteckningar — fältet är borttaget; finns gammal text visas den som en grå rad, aldrig raderad */
  gamlaAnteckningar: string;
  /** databasen saknar de nya kolumnerna (migrationen ej körd) / fälten gick inte att läsa: kortet visar det, svar sparas inte */
  datalage: 'ok' | 'migrering-saknas' | 'lasfel';
  sparFel: string | null;
  klarSparar: boolean;
  /** när ved-vyn är öppen vid öppning (efter att ved-symbolen satts på kartan) */
  startMedVed?: boolean;
  onAndra: (patch: KlarPatch) => void;
  onHarDu: (id: HarDuId, varde: HarDuSvarVarde) => void;
  onPlaceraAvlagg: () => void;
  onRitaBasvag: () => void;
  onStammer: () => void;
  onVed: (v: VedDetaljer) => void;
  onSattVedPaKartan: () => void;
  onKlarForMaskin: () => void;
  onFortsatter: () => void;
  onStang: () => void;
}

const datum = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
};

/** Radens högersida: orange uppmaning när något är kvar (färg + ord), annars värdet i dämpad text. */
function RadHoger({ post, uppmaning }: { post: Post; uppmaning: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, flexShrink: 0, maxWidth: '55%', textAlign: 'right' }}>
      {post.kvar
        ? <span style={{ ...TYP.listtitel, color: FARG.orange }}>{uppmaning}</span>
        : <span style={{ ...TYP.text, color: post.id === 'prognos' && post.varde === 'Stämmer' ? FARG.gron : FARG.text2, overflowWrap: 'anywhere' }}>{post.varde}</span>}
      <Pil />
    </span>
  );
}

/** En rad i del 1. Trycket fäller ut redigeringen under raden (högst en i taget). */
function PostRad({ post, uppmaning, oppen, onToggle, children, forst = false, under }: {
  post: Post; uppmaning: string; oppen: boolean; onToggle: () => void; children?: React.ReactNode; forst?: boolean; under?: React.ReactNode;
}) {
  return (
    <div data-testid={`klar-post-${post.id}`} data-kvar={post.kvar ? '1' : '0'} style={{ borderTop: forst ? 'none' : `1px solid ${FARG.linje}` }}>
      <button type="button" data-testid={`klar-rad-${post.id}`} aria-expanded={children ? oppen : undefined} onClick={onToggle} className="press-row"
        style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block' }}>{post.etikett}</span>
          {under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{under}</span>}
        </span>
        <RadHoger post={post} uppmaning={uppmaning} />
      </button>
      {oppen && children && <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>{children}</div>}
    </div>
  );
}

/** Raden säger VILKEN maskin det är (inte bara "Egen"). Okänd maskin-id → "Egen". */
function medMaskinnamn(post: Post, u: UtforareVal, lista: MaskinAlternativ[]): Post {
  if (utforareLage(u) !== 'egen') return post;
  return { ...post, varde: lista.find((m) => m.id === u.maskinId)?.namn ?? 'Egen' };
}

/** Tre val i rad (bärighet, terräng, skotningsavstånd). Samma val igen tar tillbaka svaret. */
function TreVal({ id, val, vald, onVal, onKlart }: { id: string; val: ReadonlyArray<{ id: string; namn: string }>; vald: string | null; onVal: (v: string | null) => void; onKlart: () => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: AVSTAND.s }}>
      {val.map((v) => <Val key={v.id} testid={`klar-${id}-${v.id}`} vald={vald === v.id} onTryck={() => { onVal(vald === v.id ? null : v.id); if (vald !== v.id) onKlart(); }}>{v.namn}</Val>)}
    </div>
  );
}

/** Egen maskin (lista) eller extern (namn) för en roll. */
function UtforareRad({ roll, v, maskiner, onVal, onKlart }: { roll: 'skordare' | 'skotare'; v: UtforareVal; maskiner: MaskinAlternativ[]; onVal: (u: UtforareVal) => void; onKlart: () => void }) {
  const extern = v.utforare === 'extern';
  const egen = !extern && (v.maskinId != null || v.utforare === 'egen');
  return (
    <div data-testid={`klar-${roll}-val`}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s, marginBottom: AVSTAND.s }}>
        <Val testid={`klar-${roll}-egen`} vald={egen} onTryck={() => { onVal({ maskinId: v.maskinId, utforare: 'egen', externNamn: '' }); if (v.maskinId) onKlart(); }}>Egen</Val>
        <Val testid={`klar-${roll}-extern`} vald={extern} onTryck={() => onVal({ maskinId: null, utforare: 'extern', externNamn: v.externNamn })}>Extern</Val>
      </div>
      {extern ? (
        <Falt testid={`klar-${roll}-extern-namn`} label={`Namn på extern ${roll === 'skordare' ? 'skördare' : 'skotare'}`} placeholder="Namn på utföraren" value={v.externNamn} onChange={(n) => onVal({ maskinId: null, utforare: 'extern', externNamn: n })} />
      ) : egen ? (
        <div data-testid={`klar-${roll}-maskiner`} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          {maskiner.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>Inga maskiner av rätt typ är registrerade.</div>}
          {maskiner.map((m) => <Val key={m.id} testid={`klar-${roll}-maskin-${m.id}`} vald={v.maskinId === m.id} onTryck={() => { onVal({ maskinId: m.id, utforare: null, externNamn: '' }); onKlart(); }} ton={m.varning ? 'orange' : undefined}>{m.namn}{m.varning ? ` · ${m.varning}` : ''}</Val>)}
        </div>
      ) : (
        <div style={{ ...TYP.meta, color: FARG.text2, marginLeft: AVSTAND.xs }}>Välj egen maskin eller extern utförare.</div>
      )}
    </div>
  );
}

/**
 * En rad i del 3: ETT tryck växlar. Etiketten är ALLTID vit vanlig text (grå text läses som avstängd rad) — bara knappen till höger visar läget:
 * grå fyllning = standard, vit fyllning = avviker. Del 3 är vanligen "Nej" och ska inte skrika.
 * `varde` = det valet står på nu, `standard` = vad som gäller när ingen rört det. `ord` ger knappens text för ja/nej (Bred/Smal, Ja/Nej).
 */
function OvrigRad({ id, etikett, varde, standard = false, onVal, ord, under, children }: {
  id: string; etikett: string; varde: boolean; standard?: boolean; onVal: (v: boolean) => void; ord?: [string, string]; under?: string; children?: React.ReactNode;
}) {
  const avviker = varde !== standard;
  const [ja, nej] = ord ?? ['Ja', 'Nej'];
  return (
    <div data-testid={`klar-ovrigt-${id}`} data-avviker={avviker ? '1' : '0'} style={{ padding: `${AVSTAND.xs}px ${AVSTAND.l}px`, borderTop: `1px solid ${FARG.linje}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar + AVSTAND.s }}>
        <span style={{ flex: 1, minWidth: 0, ...TYP.text, color: FARG.text }}>{etikett}</span>
        <button type="button" data-testid={`klar-ovrigt-${id}-vaxla`} data-varde={varde ? 'ja' : 'nej'} aria-pressed={varde} aria-label={`${etikett}: ${varde ? ja : nej}. Tryck för att ändra`} onClick={() => onVal(!varde)} className="press-scale"
          style={{ minWidth: TRAFFYTA.primar + AVSTAND.l, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, border: 'none', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
            background: avviker ? FARG.text : FARG.fyllning, color: avviker ? FARG.bg : FARG.text2, ...TYP.listtitel }}>
          {varde ? ja : nej}
        </button>
      </div>
      {under && <div style={{ ...TYP.meta, color: FARG.text2, margin: `0 ${AVSTAND.xs}px ${AVSTAND.s}px` }}>{under}</div>}
      {varde && children}
    </div>
  );
}

/** m³fub per G15-timme som heltal ("38") — en decimal under 10 ("4,6"), som gallringens låga tal kräver. */
export function fmtPrestation(v: number): string {
  return (v < 10 ? v.toFixed(1) : String(Math.round(v))).replace('.', ',');
}

/** En maskins G15-timmar i den öppna prognosraden: fältet, uppmätt prestation, källan till förslaget — eller orange varför förslag saknas. */
function MaskinTid({ roll, etikett, mp, onTim }: { roll: 'skordare' | 'skotare'; etikett: string; mp: MaskinPrognos; onTim: (v: string) => void }) {
  return (
    <div data-testid={`klar-${roll}-tid`} style={{ marginTop: AVSTAND.s }}>
      <Etikett>{etikett}, G15-tim</Etikett>
      <Falt testid={roll === 'skordare' ? 'klar-skordartimmar' : 'klar-skotartimmar'} label={`${etikett}, G15-timmar`} numeriskt value={mp.tim} onChange={onTim} />
      {mp.prestation != null && <div data-testid={`klar-${roll}-prestation`} style={{ ...TYP.meta, ...TNUM, color: FARG.text2, margin: `${AVSTAND.xs}px ${AVSTAND.xs}px 0` }}>{fmtPrestation(mp.prestation)} m³fub/G15</div>}
      {mp.forslag && <div data-testid={`klar-${roll}-kalla`} style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px ${AVSTAND.xs}px 0`, overflowWrap: 'anywhere' }}>{mp.forslag.kalla}</div>}
      {mp.andrad && mp.forslag && <div data-testid={`klar-${roll}-andrad`} style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px ${AVSTAND.xs}px 0` }}>Ändrad av dig · förslag {mp.forslag.g15}</div>}
      {!mp.forslag && mp.saknas && <div data-testid={`klar-${roll}-forslag-saknas`} style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.xs}px ${AVSTAND.xs}px 0`, overflowWrap: 'anywhere' }}>{mp.saknas}</div>}
    </div>
  );
}

export default function KlarMedTrakten(p: KlarMedTraktenProps) {
  const [oppen, setOppen] = useState<PostId | null>(null);
  const [vy, setVy] = useState<'kort' | 'ved'>(p.startMedVed ? 'ved' : 'kort');
  const vaxla = (id: PostId) => setOppen((o) => (o === id ? null : id));
  /** Ett val är gjort → raden stängs så nästa syns direkt. Bara den rad som är öppen stängs. */
  const stangRad = (id: PostId) => setOppen((o) => (o === id ? null : o));
  const post = (id: PostId) => p.status.poster.find((x) => x.id === id)!;
  const { status } = p;
  const planerad = p.objektStatus === 'planerad';

  if (vy === 'ved') {
    return <KlarVed namn={p.namn} ved={p.ved} onAndra={p.onVed} onSattPaKartan={p.onSattVedPaKartan} onTillbaka={() => setVy('kort')} onIngenVed={() => { p.onAndra({ ved: false }); setVy('kort'); }} onStang={p.onStang} />;
  }

  const pg = p.prognos;
  const prognosPost = post('prognos');
  const harAllt = status.prognos.lage === 'ogodkand' && status.prognos.saknas.length === 0;
  // Hopfälld rad: en rad per maskin med G15-tim och prestation, "Skördare 52 G15-tim · 38 m³fub/G15". Bara egna maskiner med en tim — aldrig ett tomt streck.
  const maskinRad = (etikett: string, mp: MaskinPrognos, egen: boolean) => (egen && mp.tim.trim() ? `${etikett} ${mp.tim.trim()} G15-tim${mp.prestation != null ? ` · ${fmtPrestation(mp.prestation)} m³fub/G15` : ''}` : null);
  const prognosRader = [maskinRad('Skördare', pg.skordare, utforareLage(p.skordare) === 'egen'), maskinRad('Skotare', pg.skotare, utforareLage(p.skotare) === 'egen')].filter((x): x is string => !!x);
  const prognosUnder = status.prognos.lage === 'extern'
    ? 'Extern utförare på båda — inget att prognostisera'
    : prognosRader.length > 0 ? <>{prognosRader.map((r, i) => <span key={i} data-testid={`klar-prognos-rad-${i}`} style={{ display: 'block', ...TNUM }}>{r}</span>)}</> : undefined;
  const prognosUppmaning = status.prognos.lage === 'ogodkand' && status.prognos.saknas.length > 0 ? `Saknar ${status.prognos.saknas[0]}` : 'Granska';

  return (
    <>
      <Huvud
        titel={`Klar med ${p.namn}?`}
        undertitel={planerad ? `Klar för maskin${p.klarSkickadAt ? ` sedan ${datum(p.klarSkickadAt)}` : ''}` : (status.klar ? 'Allt är ifyllt' : `${status.antalKvar} ${status.antalKvar === 1 ? 'sak' : 'saker'} kvar`)}
        onStang={p.onStang} />
      <div data-testid="klar-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px` }}>
        {p.datalage !== 'ok' && (
          <div data-testid="klar-datalage" role="note" style={{ display: 'flex', gap: AVSTAND.m, marginBottom: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.orange, flexShrink: 0 }}>warning</span>
            <span style={{ ...TYP.text, color: FARG.orange }}>
              {p.datalage === 'migrering-saknas'
                ? 'Databasen saknar de nya fälten (migrationen är inte körd). Svaren du ger här sparas inte.'
                : 'Svaren för trakten gick inte att läsa. Stäng och öppna kortet igen — inget sparas förrän de är lästa.'}
            </span>
          </div>
        )}
        {p.sparFel && (
          <div data-testid="klar-sparfel" role="alert" style={{ marginBottom: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt, ...TYP.text, color: FARG.orange }}>{p.sparFel}</div>
        )}

        {/* ── 1. APPEN HAR FYLLT I ───────────────────────────────────────────────────────────────────────────── */}
        <Rubrik>Appen har fyllt i</Rubrik>
        <Gruppkort testid="klar-del1">
          <PostRad forst post={post('avlagg')} uppmaning="Placera" oppen={false} onToggle={p.onPlaceraAvlagg} />

          <PostRad post={post('basvag')} uppmaning="Rita" oppen={oppen === 'basvag'} onToggle={() => vaxla('basvag')}
            under={post('basvag').kvar ? 'Vida har en basväg i underlaget — den är inte ritad än' : p.basvag.kravs ? `Kräver basvägsanläggning${p.basvag.timmar ? ` · ${p.basvag.timmar} tim` : ''}` : undefined}>
            <div data-testid="klar-basvag-redigera">
              <button type="button" data-testid="klar-basvag-rita" onClick={p.onRitaBasvag} className="press-scale" style={{ ...KNAPP.sekundar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                {p.basvag.texter.length > 0 ? 'Rita en basväg till' : 'Rita basväg'}
              </button>
              <div style={{ height: AVSTAND.s }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
                <span style={{ flex: 1, ...TYP.text }}>Kräver basvägsanläggning</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.xs, width: 128 }}>
                  <Val testid="klar-basvagskrav-ja" vald={p.basvag.kravs === true} onTryck={() => p.onAndra({ basvagKravs: true })}>Ja</Val>
                  <Val testid="klar-basvagskrav-nej" vald={p.basvag.kravs !== true} onTryck={() => p.onAndra({ basvagKravs: false })}>Nej</Val>
                </div>
              </div>
              {p.basvag.kravs && (
                <>
                  <Etikett>Engångstid för anläggningen (G15-tim, läggs på skotarens prognos)</Etikett>
                  <Falt testid="klar-basvag-timmar" label="Timmar för basvägsanläggning" numeriskt placeholder="t.ex. 6" value={p.basvag.timmar} onChange={(v) => p.onAndra({ basvagTimmar: v })} />
                </>
              )}
            </div>
          </PostRad>

          <PostRad post={post('barighet')} uppmaning="Välj" oppen={oppen === 'barighet'} onToggle={() => vaxla('barighet')}>
            <TreVal id="barighet" onKlart={() => stangRad('barighet')} val={BARIGHET_VAL} vald={p.barighet} onVal={(v) => p.onAndra({ barighet: v })} />
          </PostRad>
          <PostRad post={post('terrang')} uppmaning="Välj" oppen={oppen === 'terrang'} onToggle={() => vaxla('terrang')}>
            <TreVal id="terrang" onKlart={() => stangRad('terrang')} val={TERRANG_VAL} vald={p.terrang} onVal={(v) => p.onAndra({ terrang: v })} />
          </PostRad>
          <PostRad post={post('skotningsavstand')} uppmaning="Välj" oppen={oppen === 'skotningsavstand'} onToggle={() => vaxla('skotningsavstand')}>
            <TreVal id="skotningsavstand" onKlart={() => stangRad('skotningsavstand')} val={SKOTNINGSAVSTAND_VAL} vald={p.skotningsavstand} onVal={(v) => p.onAndra({ skotningsavstand: v })} />
          </PostRad>

          <PostRad post={medMaskinnamn(post('skordare'), p.skordare, p.maskiner.skordare)} uppmaning="Välj" oppen={oppen === 'skordare'} onToggle={() => vaxla('skordare')}>
            <UtforareRad roll="skordare" onKlart={() => stangRad('skordare')} v={p.skordare} maskiner={p.maskiner.skordare} onVal={(u) => p.onAndra({ skordare: u })} />
          </PostRad>
          <PostRad post={medMaskinnamn(post('skotare'), p.skotare, p.maskiner.skotare)} uppmaning="Välj" oppen={oppen === 'skotare'} onToggle={() => vaxla('skotare')}>
            <UtforareRad roll="skotare" onKlart={() => stangRad('skotare')} v={p.skotare} maskiner={p.maskiner.skotare} onVal={(u) => p.onAndra({ skotare: u })} />
          </PostRad>

          <PostRad post={post('medelstam')} uppmaning="Skriv" oppen={oppen === 'medelstam'} onToggle={() => vaxla('medelstam')}
            under={post('medelstam').kvar ? 'Saknas i traktdirektivet — förslaget räknar då snitt över alla trakter' : undefined}>
            <div data-testid="klar-medelstam-redigera">
              <Etikett>Medelstam, m³fub per stam</Etikett>
              <Falt testid="klar-medelstam" label="Medelstam" numeriskt placeholder="t.ex. 0,72" value={pg.medelstam} onChange={(v) => p.onAndra({ medelstam: v })} />
            </div>
          </PostRad>

          <PostRad post={prognosPost} uppmaning={prognosUppmaning} oppen={oppen === 'prognos'} onToggle={() => vaxla('prognos')} under={prognosUnder}>
            <div data-testid="klar-prognos-redigera">
              {status.prognos.lage !== 'extern' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s }}>
                    <div><Etikett>Volym, m³fub</Etikett><Falt testid="klar-volym" label="Volym" numeriskt value={pg.volym} onChange={(v) => p.onAndra({ volym: v })} /></div>
                    <div><Etikett>Areal, ha</Etikett><Falt testid="klar-areal" label="Areal" numeriskt value={pg.areal} onChange={(v) => p.onAndra({ areal: v })} /></div>
                  </div>
                  {utforareLage(p.skordare) === 'egen' && <MaskinTid roll="skordare" etikett="Skördare" mp={pg.skordare} onTim={(v) => p.onAndra({ skordareTimmar: v })} />}
                  {utforareLage(p.skotare) === 'egen' && <MaskinTid roll="skotare" etikett="Skotare" mp={pg.skotare} onTim={(v) => p.onAndra({ skotareTimmar: v })} />}
                  {pg.forutsattningar.length > 0 && (
                    <div data-testid="klar-prognos-forutsattningar" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Utgår från: {pg.forutsattningar.join(' · ')}</div>
                  )}
                  {status.prognos.lage === 'ogodkand' && status.prognos.saknas.length > 0 && (
                    <div data-testid="klar-prognos-saknas" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.s }}>Saknar: {status.prognos.saknas.join(', ')}</div>
                  )}
                  <div style={{ height: AVSTAND.s }} />
                  <button type="button" data-testid="klar-stammer" onClick={p.onStammer} disabled={!harAllt && status.prognos.lage !== 'godkand'} className="press-scale"
                    style={{ ...KNAPP.primar, ...(harAllt ? null : { opacity: 0.4 }), cursor: harAllt ? 'pointer' : 'default', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                    {status.prognos.lage === 'godkand' ? `Stämmer ✓${p.prognos.godkandAv ? ` · ${p.avNamn(p.prognos.godkandAv) ?? ''}` : ''}${p.prognos.godkandAt ? ` ${datum(p.prognos.godkandAt)}` : ''}` : 'Stämmer'}
                  </button>
                  <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Godkännandet gäller för just det här underlaget. Ändras volym, medelstam, förutsättningar eller maskin måste du trycka Stämmer igen.</div>
                </>
              )}
            </div>
          </PostRad>
        </Gruppkort>

        {/* ── 2. HAR DU … ──────────────────────────────────────────────────────────────────────────────────────── */}
        <div style={{ height: AVSTAND.sektion }} />
        <Rubrik>Har du …</Rubrik>
        <Gruppkort testid="klar-del2">
          {HAR_DU_FRAGOR.map((f, i) => {
            const svar = p.harDu[f.id];
            const varn = p.varningar.filter((v) => v.fraga === f.id);
            const vem = svar ? [p.avNamn(svar.av), datum(svar.at)].filter(Boolean).join(' · ') : '';
            return (
              <div key={f.id} data-testid={`klar-fraga-${f.id}`} data-besvarad={svar ? '1' : '0'} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                <div style={{ ...TYP.text, marginBottom: AVSTAND.s }}>{f.fraga}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s }}>
                  <Val testid={`klar-fraga-${f.id}-ja`} vald={svar?.svar === 'ja'} onTryck={() => p.onHarDu(f.id, 'ja')}>{f.ja}</Val>
                  <Val testid={`klar-fraga-${f.id}-nej`} vald={svar?.svar === f.nejVarde} onTryck={() => p.onHarDu(f.id, f.nejVarde)}>{f.nej}</Val>
                </div>
                {vem && <div data-testid={`klar-fraga-${f.id}-vem`} style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px ${AVSTAND.xs}px 0` }}>Svarat {vem}</div>}
                {varn.map((v, k) => (
                  <div key={k} data-testid={`klar-varning-${f.id}`} role="note" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginTop: AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.rad, background: FARG.fyllning }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.text, color: FARG.orange, flexShrink: 0 }}>warning</span>
                    <span style={{ ...TYP.meta, color: FARG.orange, overflowWrap: 'anywhere' }}>{v.text}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </Gruppkort>

        {/* ── 3. MARKÄGARE & ÖVRIGT (räknas aldrig) ────────────────────────────────────────────────────────────── */}
        <div style={{ height: AVSTAND.sektion }} />
        <Rubrik>Markägare & övrigt</Rubrik>
        <Gruppkort testid="klar-del3">
          <div data-testid="klar-ovrigt-ved" style={{ borderTop: 'none' }}>
            <button type="button" data-testid="klar-ved-rad" onClick={() => { if (!p.ovrigt.ved) p.onAndra({ ved: true }); setVy('ved'); }} className="press-row"
              style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block' }}>Ved till markägaren</span>
                {p.ovrigt.ved && <span data-testid="klar-ved-text" style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{p.ovrigt.vedText}</span>}
              </span>
              {/* samma läge-knapp som övriga rader: grå = Nej (standard), vit = Ja (avviker) */}
              <span data-testid="klar-ved-lage" data-avviker={p.ovrigt.ved ? '1' : '0'}
                style={{ boxSizing: 'border-box', minWidth: TRAFFYTA.primar + AVSTAND.l, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: p.ovrigt.ved ? FARG.text : FARG.fyllning, color: p.ovrigt.ved ? FARG.bg : FARG.text2, ...TYP.listtitel }}>
                {p.ovrigt.ved ? 'Ja' : 'Nej'}
              </span>
              <Pil />
            </button>
          </div>
          <OvrigRad id="band-skordare" etikett="Band skördare" varde={p.ovrigt.bandSkordare === true} onVal={(v) => p.onAndra({ bandSkordare: v })}>
            <ParVal id="skordare" vald={p.ovrigt.bandParSkordare} onVal={(v) => p.onAndra({ bandParSkordare: v })} />
          </OvrigRad>
          <OvrigRad id="band-skotare" etikett="Band skotare" varde={p.ovrigt.bandSkotare === true} onVal={(v) => p.onAndra({ bandSkotare: v })}>
            <ParVal id="skotare" vald={p.ovrigt.bandParSkotare} onVal={(v) => p.onAndra({ bandParSkotare: v })} />
          </OvrigRad>
          <OvrigRad id="breddat" etikett="Breddat lastrede" varde={p.ovrigt.breddat} onVal={(v) => p.onAndra({ breddat: v })} />
          {p.ovrigt.visaKonfiguration && (
            <OvrigRad id="konfiguration" etikett="Konfiguration" varde={p.ovrigt.konfiguration === 'smal'} ord={['Smal', 'Bred']} onVal={(v) => p.onAndra({ konfiguration: v ? 'smal' : 'bred' })} />
          )}
          <OvrigRad id="ris" etikett="Ris skotas direkt" varde={p.ovrigt.risDirekt} onVal={(v) => p.onAndra({ risDirekt: v })} under={p.ovrigt.risDirekt ? undefined : 'Nej = riset ligger först'} />
          <OvrigRad id="vagn" etikett="Extra vagn" varde={p.ovrigt.extraVagn} onVal={(v) => p.onAndra({ extraVagn: v })} />
          <OvrigRad id="trailer" etikett="Trailer kan köra in" varde={p.ovrigt.trailerIn} standard onVal={(v) => p.onAndra({ trailerIn: v })}>{null}</OvrigRad>
          {!p.ovrigt.trailerIn && (
            <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>
              <Falt testid="klar-trailer-kommentar" label="Kommentar om trailern" placeholder="Varför inte? T.ex. låg bro" value={p.ovrigt.trailerKommentar} onChange={(v) => p.onAndra({ trailerKommentar: v })} />
            </div>
          )}
          <OvrigRad id="manuell" etikett="Manuell fällning" varde={p.ovrigt.manuellFallning} onVal={(v) => p.onAndra({ manuellFallning: v })}>
            <div style={{ paddingBottom: AVSTAND.s }}>
              <Falt testid="klar-manuell-text" label="Var och varför" placeholder="Var och varför" value={p.ovrigt.manuellFallningText} onChange={(v) => p.onAndra({ manuellFallningText: v })} />
            </div>
          </OvrigRad>
          {p.gamlaAnteckningar.trim() && (
            <div data-testid="klar-gamla-anteckningar" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: `1px solid ${FARG.linje}` }}>
              <div style={{ ...TYP.meta, color: FARG.text3 }}>Gamla anteckningar</div>
              <div style={{ ...TYP.text, color: FARG.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.gamlaAnteckningar.trim()}</div>
            </div>
          )}
        </Gruppkort>
      </div>

      {/* ── KLAR FÖR MASKIN ───────────────────────────────────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.l)}`, borderTop: `1px solid ${FARG.linje}` }}>
        {planerad ? (
          <div data-testid="klar-skickad" style={{ ...TYP.listtitel, color: FARG.gron, textAlign: 'center', minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Klar för maskin ✓{status.antalKvar > 0 ? <span style={{ color: FARG.orange }}>&nbsp;· {status.antalKvar} kvar sedan sist</span> : null}
          </div>
        ) : (
          <>
            <button type="button" data-testid="klar-for-maskin" data-klar={status.klar ? '1' : '0'} onClick={p.onKlarForMaskin} disabled={p.klarSparar} className="press-scale"
              style={{ ...KNAPP.primar, background: status.klar ? FARG.gron : FARG.fyllning, color: status.klar ? FARG.bg : FARG.text, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...(p.klarSparar ? { opacity: 0.4 } : null) }}>
              {p.klarSparar ? 'Skickar …' : 'Klar för maskin'}
            </button>
            {!status.klar && <div data-testid="klar-kvar-text" style={{ ...TYP.meta, color: FARG.orange, textAlign: 'center', margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, overflowWrap: 'anywhere' }}>Kvar: {status.kvarText}</div>}
          </>
        )}
        <button type="button" data-testid="klar-fortsatter" onClick={p.onFortsatter} className="press-dim"
          style={{ ...KNAPP.tertiar, width: '100%', justifyContent: 'center', marginTop: AVSTAND.xs, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>Fortsätter en annan dag</button>
      </div>
    </>
  );
}

/** 1 par / 2 par under en band-rad som är på. */
function ParVal({ id, vald, onVal }: { id: string; vald: string | null; onVal: (v: string | null) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.xs, paddingBottom: AVSTAND.s }}>
      {[{ id: '1', namn: '1 par' }, { id: '2', namn: '2 par' }].map((o) => <Val key={o.id} testid={`klar-par-${id}-${o.id}`} vald={vald === o.id} onTryck={() => onVal(vald === o.id ? null : o.id)}>{o.namn}</Val>)}
    </div>
  );
}
