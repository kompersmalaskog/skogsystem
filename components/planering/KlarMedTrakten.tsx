'use client';

// "KLAR MED TRAKTEN" (tavla 34, omdesign v2 efter test på Mölleryd): planerarens färdigplanering. Appen har fyllt i det den kan; planeraren tittar, rättar och svarar på det appen inte kan veta.
//
// Rubriken är traktens namn; under står läget i ord ("Allt klart ✓" / "N saker kvar" / "Klar för maskin ✓"). N räknas per OMRÅDE (Förutsättningar = ett, Har du … = ett) och står BARA här.
// Orange finns bara på antalet i rubriken och på värdet i Behöver dig-raderna (och på etiketten för en förutsättning som inte är vald). Fast ordning uppifrån:
//   1. BEHÖVER DIG      korta rader med orange värde + pil: Avlägg › Placera på kartan · Förutsättningar › "3 att välja" (fälls ut på plats) · Har du … › "0 av 6" (egen vy, en fråga i taget).
//                       Ett klart område försvinner ur listan. Är bara EN fråga kvar står den direkt i listan.
//   2. PROGNOSKORT      volym stort + medelstam · tabell skördare/skotare × G15-tim och m³fub/G15 · Stämmer. Ett tryck på en siffra redigerar den PÅ PLATS. Stämmer går att trycka även utan medelstam.
//   3. DET SOM ÄR KLART bara det som faktiskt är klart: Appen har fyllt i · N uppgifter › · Markägare & övrigt › (och Har du … när alla sex är besvarade)
//   Längst ner: Klar för maskin (grå / grön) och Fortsätter en annan dag.
//
// KLAR FÖR MASKIN SPÄRRAR ALDRIG: den går att trycka även när något är kvar.
// Ren presentation: sidan räknar (lib/klarTrakt) och sparar; kortet ritar och säger vad som trycktes.

import React, { useRef, useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import {
  BARIGHET_VAL, FORUTSATTNING_IDS, HAR_DU_FRAGOR, SKOTNINGSAVSTAND_VAL, TERRANG_VAL, utforareLage,
  type HarDuFraga, type HarDuId, type HarDuSvar, type HarDuSvarVarde, type KlarStatus, type Post, type PostId, type UtforareVal, type Varning, type VedDetaljer,
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
  forslag: { g15: number; kalla: string; /** "slutavverkningar" / "gallringar" när förslaget är snitt över alla trakter av typen för att medelstam saknas */ snittOver?: string } | null;
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
  /** sammanfattning = "5 st · 599 m" (en rad, inte en rad per väg); null = inga ritade eller längd saknas på någon (då står bara texterna) */
  basvag: { texter: string[]; kravs: boolean | null; timmar: string; sammanfattning?: string | null };
  barighet: string | null; terrang: string | null; skotningsavstand: string | null;
  skordare: UtforareVal; skotare: UtforareVal;
  maskiner: { skordare: MaskinAlternativ[]; skotare: MaskinAlternativ[] };
  prognos: {
    volym: string; areal: string; medelstam: string;
    skordare: MaskinPrognos; skotare: MaskinPrognos;
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

/** "17/10" — dag/månad, som Stämmer-knappen visar det. */
const dagManad = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`;
};
/** "15 okt" — när en Har du-fråga besvarades. */
const datum = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
};
/** Texten i ett fält → tal (komma eller punkt). null = tomt eller inget tal. */
const tal = (t: string): number | null => {
  const n = Number(t.replace(/\s/g, '').replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(n) ? n : null;
};
/** 1734 → "1 734" (tusentalsavgränsare, som resten av appen). */
const sv = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

/** Radens högersida: orange uppmaning när något är kvar (färg + ord), annars värdet i dämpad text. */
function RadHoger({ post, uppmaning, varde }: { post: Post; uppmaning: string; varde?: string | null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, flexShrink: 0, maxWidth: '58%', textAlign: 'right' }}>
      {post.kvar
        ? <span style={{ ...TYP.listtitel, color: FARG.orange }}>{uppmaning}</span>
        : <span style={{ ...TYP.text, color: FARG.text2, overflowWrap: 'anywhere' }}>{varde !== undefined ? varde : post.varde}</span>}
      <Pil />
    </span>
  );
}

/** En rad i "Behöver dig" eller "Appen har fyllt i". Trycket fäller ut redigeringen under raden (högst en i taget). */
function PostRad({ post, uppmaning, oppen, onToggle, children, forst = false, under, varde }: {
  post: Post; uppmaning: string; oppen: boolean; onToggle: () => void; children?: React.ReactNode; forst?: boolean; under?: React.ReactNode; varde?: string | null;
}) {
  return (
    <div data-testid={`klar-post-${post.id}`} data-kvar={post.kvar ? '1' : '0'} style={{ borderTop: forst ? 'none' : `1px solid ${FARG.linje}` }}>
      <button type="button" data-testid={`klar-rad-${post.id}`} aria-expanded={children ? oppen : undefined} onClick={onToggle} className="press-row"
        style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block' }}>{post.etikett}</span>
          {under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{under}</span>}
        </span>
        <RadHoger post={post} uppmaning={uppmaning} varde={varde} />
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

/** iOS-segmentknapp med tre val (bärighet, terräng, skotningsavstånd). Etiketten är orange så länge inget är valt. Samma val igen tar tillbaka svaret. */
function Segment({ id, etikett, val, vald, onVal }: { id: string; etikett: string; val: ReadonlyArray<{ id: string; namn: string }>; vald: string | null; onVal: (v: string | null) => void }) {
  return (
    <div data-testid={`klar-seg-${id}`} data-vald={vald ? '1' : '0'}>
      <div data-testid={`klar-seg-${id}-etikett`} style={{ ...TYP.meta, color: vald ? FARG.text2 : FARG.orange, margin: `0 ${AVSTAND.xs}px ${AVSTAND.xs}px` }}>{etikett}</div>
      <div role="group" aria-label={etikett} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: AVSTAND.xs, background: FARG.fyllning, borderRadius: RADIE.rad, padding: AVSTAND.xs }}>
        {val.map((v) => (
          <button key={v.id} type="button" data-testid={`klar-${id}-${v.id}`} aria-pressed={vald === v.id} onClick={() => onVal(vald === v.id ? null : v.id)} className="press-scale"
            style={{ minHeight: TRAFFYTA.min, border: 'none', borderRadius: RADIE.rad, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
              background: vald === v.id ? FARG.text : 'transparent', color: vald === v.id ? FARG.bg : FARG.text, ...(vald === v.id ? TYP.listtitel : TYP.text) }}>
            {v.namn}
          </button>
        ))}
      </div>
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
 * En rad i Markägare & övrigt: ETT tryck växlar. Etiketten är ALLTID vit vanlig text (grå text läses som avstängd rad) — bara knappen till höger visar läget:
 * grå fyllning = standard, vit fyllning = avviker. Raderna är vanligen "Nej" och ska inte skrika.
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

/** Ett tal i prognoskortet som går att trycka på: visar talet (eller en orange uppmaning när det saknas) — tryck byter det mot ett fält PÅ PLATS. */
function TalCell({ id, aktiv, onAktiv, onKlart, varde, onChange, label, tom, align = 'right', stor = false, children }: {
  id: string; aktiv: boolean; onAktiv: () => void; onKlart: () => void; varde: string; onChange: (v: string) => void; label: string;
  /** texten när talet saknas (dämpad — orange står bara i rubriken och i Behöver dig-raderna) */
  tom: string; align?: 'left' | 'right'; stor?: boolean; children: React.ReactNode;
}) {
  if (aktiv) return <Falt testid={`klar-${id}`} label={label} numeriskt kompakt value={varde} onChange={onChange} onKlart={onKlart} />;
  const saknas = varde.trim() === '';
  // `stor` = ett tal som står fritt i kortet (volymen, medelstam, areal): ingen ruta, men samma 44 px träffyta. Annars en siffra i tabellen: en ruta som visar att den går att trycka på.
  const yta = stor
    ? { background: 'transparent', padding: `0 ${AVSTAND.xs}px`, marginLeft: align === 'left' ? -AVSTAND.xs : 0, marginRight: align === 'right' ? -AVSTAND.xs : 0 }
    : { background: FARG.fyllning, padding: `0 ${AVSTAND.m}px`, ...TYP.listtitel };
  return (
    <button type="button" data-testid={`klar-cell-${id}`} aria-label={`${label}: ${saknas ? 'saknas' : varde}. Tryck för att ändra`} onClick={onAktiv} className="press-scale"
      style={{ minHeight: TRAFFYTA.min, minWidth: TRAFFYTA.min, borderRadius: RADIE.rad, border: 'none', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', color: saknas ? FARG.text2 : FARG.text, textAlign: align, ...TNUM, ...yta }}>
      {saknas ? <span style={TYP.listtitel}>{tom}</span> : children}
    </button>
  );
}

/** En Har du-fråga: frågan, två svar, vem som svarat, och det appen vet (orange). Används i "Behöver dig" (obesvarad) och i den utfällda gruppen (besvarad). */
function FragaBlock({ f, svar, varningar, avNamn, onHarDu, forst }: {
  f: HarDuFraga; svar: HarDuSvar[HarDuId]; varningar: Varning[]; avNamn: (id: string | null) => string | null; onHarDu: (id: HarDuId, v: HarDuSvarVarde) => void; forst: boolean;
}) {
  const vem = svar ? [avNamn(svar.av), datum(svar.at)].filter(Boolean).join(' · ') : '';
  return (
    <div data-testid={`klar-fraga-${f.id}`} data-besvarad={svar ? '1' : '0'} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: forst ? 'none' : `1px solid ${FARG.linje}` }}>
      <div style={{ ...TYP.text, marginBottom: AVSTAND.s }}>{f.fraga}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s }}>
        <Val testid={`klar-fraga-${f.id}-ja`} vald={svar?.svar === 'ja'} onTryck={() => onHarDu(f.id, 'ja')}>{f.ja}</Val>
        <Val testid={`klar-fraga-${f.id}-nej`} vald={svar?.svar === f.nejVarde} onTryck={() => onHarDu(f.id, f.nejVarde)}>{f.nej}</Val>
      </div>
      {vem && <div data-testid={`klar-fraga-${f.id}-vem`} style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px ${AVSTAND.xs}px 0` }}>Svarat {vem}</div>}
      {varningar.map((v, k) => (
        <div key={k} data-testid={`klar-varning-${f.id}`} role="note" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginTop: AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.rad, background: FARG.fyllning }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.text, color: FARG.orange, flexShrink: 0 }}>warning</span>
          <span style={{ ...TYP.meta, color: FARG.orange, overflowWrap: 'anywhere' }}>{v.text}</span>
        </div>
      ))}
    </div>
  );
}

/** En klar rad under prognosen: etikett, dämpat värde, pil. Tryck fäller ut på plats (pilen vrids). */
function GruppRad({ id, etikett, sammanfattning, oppen, onToggle, forst = false, children }: {
  id: string; etikett: string; sammanfattning: string; oppen: boolean; onToggle: () => void; forst?: boolean; children: React.ReactNode;
}) {
  return (
    <div data-testid={`klar-grupp-${id}`} data-oppen={oppen ? '1' : '0'} style={{ borderTop: forst ? 'none' : `1px solid ${FARG.linje}` }}>
      <button type="button" data-testid={`klar-grupp-${id}-rad`} aria-expanded={oppen} onClick={onToggle} className="press-row"
        style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
        <span style={{ flex: 1, minWidth: 0 }}>{etikett}</span>
        <span data-testid={`klar-grupp-${id}-sammanfattning`} style={{ ...TYP.text, color: FARG.text2, textAlign: 'right', overflowWrap: 'anywhere' }}>{sammanfattning}</span>
        <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0, transform: oppen ? 'rotate(90deg)' : 'none' }}><Pil /></span>
      </button>
      {oppen && <div data-testid={`klar-grupp-${id}-innehall`}>{children}</div>}
    </div>
  );
}

/** En rad som öppnar en egen vy (Har du …): etikett, värde, pil. `kvar` = värdet är orange (Behöver dig), annars dämpat (klart). */
function VyRad({ id, etikett, varde, kvar, onTryck, forst = false }: { id: string; etikett: string; varde: string; kvar: boolean; onTryck: () => void; forst?: boolean }) {
  return (
    <div data-testid={`klar-post-${id}`} data-kvar={kvar ? '1' : '0'} style={{ borderTop: forst ? 'none' : `1px solid ${FARG.linje}` }}>
      <button type="button" data-testid={`klar-rad-${id}`} onClick={onTryck} className="press-row"
        style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
        <span style={{ flex: 1, minWidth: 0 }}>{etikett}</span>
        <span data-testid={`klar-rad-${id}-varde`} style={{ ...(kvar ? TYP.listtitel : TYP.text), color: kvar ? FARG.orange : FARG.text2, textAlign: 'right' }}>{varde}</span>
        <Pil />
      </button>
    </div>
  );
}

/**
 * Förutsättningar: bärighet, terräng och skotningsavstånd som ETT område. Raden säger vad som är kvar ("3 att välja", sedan "2 kvar", "1 kvar") i orange; tryck fäller ut tre
 * segmentknappar på plats. Är alla tre valda fälls raden ihop (anroparen) och området försvinner ur Behöver dig.
 */
function ForutsRad({ kvar, oppen, onToggle, forst, barighet, terrang, skotningsavstand, onVal }: {
  kvar: number; oppen: boolean; onToggle: () => void; forst: boolean; barighet: string | null; terrang: string | null; skotningsavstand: string | null;
  onVal: (patch: { barighet?: string | null; terrang?: string | null; skotningsavstand?: string | null }) => void;
}) {
  const namn = (val: ReadonlyArray<{ id: string; namn: string }>, v: string | null) => val.find((x) => x.id === v)?.namn ?? v;
  const sammanfattning = [namn(BARIGHET_VAL, barighet), namn(TERRANG_VAL, terrang), namn(SKOTNINGSAVSTAND_VAL, skotningsavstand)].filter(Boolean).join(' · ');
  const varde = kvar === 3 ? '3 att välja' : `${kvar} kvar`;
  return (
    <div data-testid="klar-post-forutsattningar" data-kvar={kvar > 0 ? '1' : '0'} style={{ borderTop: forst ? 'none' : `1px solid ${FARG.linje}` }}>
      <button type="button" data-testid="klar-rad-forutsattningar" aria-expanded={oppen} onClick={onToggle} className="press-row"
        style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
        <span style={{ flex: 1, minWidth: 0 }}>Förutsättningar</span>
        {kvar > 0
          ? <span data-testid="klar-rad-forutsattningar-varde" style={{ ...TYP.listtitel, color: FARG.orange, textAlign: 'right' }}>{varde}</span>
          : <span data-testid="klar-rad-forutsattningar-varde" style={{ ...TYP.text, color: FARG.text2, textAlign: 'right', overflowWrap: 'anywhere' }}>{sammanfattning}</span>}
        <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0, transform: oppen ? 'rotate(90deg)' : 'none' }}><Pil /></span>
      </button>
      {oppen && (
        <div data-testid="klar-forutsattningar-redigera" style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
          <Segment id="barighet" etikett="Bärighet" val={BARIGHET_VAL} vald={barighet} onVal={(v) => onVal({ barighet: v })} />
          <Segment id="terrang" etikett="Terräng" val={TERRANG_VAL} vald={terrang} onVal={(v) => onVal({ terrang: v })} />
          <Segment id="skotningsavstand" etikett="Skotningsavstånd" val={SKOTNINGSAVSTAND_VAL} vald={skotningsavstand} onVal={(v) => onVal({ skotningsavstand: v })} />
        </div>
      )}
    </div>
  );
}

/**
 * Har du … som egen vy: en fråga i taget, stor rubrik, två knappar à 60 pt, ett framstegsstreck med sex delar överst, "‹ traktnamn" tillbaka, Föregående och Hoppa över längst ner.
 * Efter ett svar kommer nästa fråga direkt; efter den sista går vyn tillbaka till kortet. Frågorna går att besvara om (de besvarade visar vem och när).
 */
function FragorVy({ namn, start, harDu, varningar, avNamn, onHarDu, onTillbaka }: {
  namn: string; start: number; harDu: HarDuSvar; varningar: Varning[]; avNamn: (id: string | null) => string | null; onHarDu: (id: HarDuId, v: HarDuSvarVarde) => void; onTillbaka: () => void;
}) {
  const [i, setI] = useState(start);
  const f = HAR_DU_FRAGOR[i];
  const svar = harDu[f.id];
  const sista = i === HAR_DU_FRAGOR.length - 1;
  const framat = () => { if (sista) onTillbaka(); else setI(i + 1); };
  const svara = (v: HarDuSvarVarde) => { onHarDu(f.id, v); framat(); };
  const vem = svar ? [avNamn(svar.av), datum(svar.at)].filter(Boolean).join(' · ') : '';
  const stor = { width: '100%', minHeight: 60, borderRadius: RADIE.kort, border: 'none', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...TYP.rubrik } as const;
  return (
    <div data-testid="klar-fragor-vy" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: `0 ${AVSTAND.l}px` }}>
        <button type="button" data-testid="klar-fragor-tillbaka" onClick={onTillbaka}
          style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, minHeight: TRAFFYTA.min, marginLeft: -AVSTAND.xs, padding: `0 ${AVSTAND.xs}px`, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', minWidth: 0, ...TYP.text }}>
          <Pil vanster />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{namn}</span>
        </button>
        <span style={{ flex: 1 }} />
        <span data-testid="klar-fragor-rakneverk" style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{i + 1} av {HAR_DU_FRAGOR.length}</span>
      </div>
      <div data-testid="klar-fragor-framsteg" style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: `repeat(${HAR_DU_FRAGOR.length}, minmax(0, 1fr))`, gap: AVSTAND.xs, padding: `${AVSTAND.s}px ${AVSTAND.l}px 0` }}>
        {HAR_DU_FRAGOR.map((q, k) => (
          <div key={q.id} data-delsteg={k === i ? 'nu' : harDu[q.id] ? 'besvarad' : 'kvar'} style={{ height: AVSTAND.xs, borderRadius: RADIE.rad, background: k === i ? FARG.text : harDu[q.id] ? FARG.gron : FARG.fyllning }} />
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: AVSTAND.m, padding: `${AVSTAND.l}px ${AVSTAND.xl}px` }}>
        <h2 data-testid="klar-fragor-fraga" style={{ margin: 0, ...TYP.titel, color: FARG.text, overflowWrap: 'anywhere' }}>{f.fraga}</h2>
        {vem && <div data-testid="klar-fragor-vem" style={{ ...TYP.text, color: FARG.text2 }}>Svarat {vem}</div>}
        {varningar.filter((v) => v.fraga === f.id).map((v, k) => (
          <div key={k} data-testid={`klar-varning-${f.id}`} role="note" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.rad, background: FARG.fyllning }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.text, color: FARG.orange, flexShrink: 0 }}>warning</span>
            <span style={{ ...TYP.meta, color: FARG.orange, overflowWrap: 'anywhere' }}>{v.text}</span>
          </div>
        ))}
      </div>
      <div style={{ flexShrink: 0, padding: `0 ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        <button type="button" data-testid={`klar-fraga-${f.id}-ja`} aria-pressed={svar?.svar === 'ja'} onClick={() => svara('ja')} className="press-scale"
          style={{ ...stor, background: !svar || svar.svar === 'ja' ? FARG.text : FARG.fyllning, color: !svar || svar.svar === 'ja' ? FARG.bg : FARG.text }}>{f.ja}</button>
        <button type="button" data-testid={`klar-fraga-${f.id}-nej`} aria-pressed={svar?.svar === f.nejVarde} onClick={() => svara(f.nejVarde)} className="press-scale"
          style={{ ...stor, background: svar?.svar === f.nejVarde ? FARG.text : FARG.fyllning, color: svar?.svar === f.nejVarde ? FARG.bg : FARG.text }}>{f.nej}</button>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', padding: `${AVSTAND.xs}px ${AVSTAND.m}px ${medSafeBotten(AVSTAND.l)}` }}>
        <button type="button" data-testid="klar-fragor-foregaende" disabled={i === 0} onClick={() => setI(i - 1)} className="press-dim"
          style={{ ...KNAPP.tertiar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...(i === 0 ? { opacity: 0.4 } : null) }}>Föregående</button>
        <button type="button" data-testid="klar-fragor-hoppa" onClick={framat} className="press-dim"
          style={{ ...KNAPP.tertiar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>Hoppa över</button>
      </div>
    </div>
  );
}

type CellId = 'volym' | 'medelstam' | 'areal' | 'skordare' | 'skotare';
/** raderna som kan vara utfällda: posterna + Förutsättningar (bärighet, terräng och skotningsavstånd är ett område) */
type RadId = PostId | 'forutsattningar';

export default function KlarMedTrakten(p: KlarMedTraktenProps) {
  const [oppen, setOppen] = useState<RadId | null>(null);
  const [grupp, setGrupp] = useState<'appen' | 'ovrigt' | null>(p.startMedVed ? 'ovrigt' : null);
  /** vilken siffra i prognoskortet som just nu är ett fält (en i taget) */
  const [cell, setCell] = useState<CellId | null>(null);
  const [vy, setVy] = useState<'kort' | 'ved' | 'fragor'>(p.startMedVed ? 'ved' : 'kort');
  /** vilken fråga Har du …-vyn börjar på (den första obesvarade, annars den första) */
  const [fragorStart, setFragorStart] = useState(0);
  const prognosRef = useRef<HTMLDivElement | null>(null);
  const vaxla = (id: RadId) => setOppen((o) => (o === id ? null : id));
  /** Ett val är gjort → raden stängs så nästa syns direkt. Bara den rad som är öppen stängs. */
  const stangRad = (id: RadId) => setOppen((o) => (o === id ? null : o));
  const vaxlaGrupp = (g: 'appen' | 'ovrigt') => setGrupp((c) => (c === g ? null : g));
  const post = (id: PostId) => p.status.poster.find((x) => x.id === id)!;
  const { status } = p;
  const planerad = p.objektStatus === 'planerad';

  if (vy === 'ved') {
    return <KlarVed namn={p.namn} ved={p.ved} onAndra={p.onVed} onSattPaKartan={p.onSattVedPaKartan} onTillbaka={() => setVy('kort')} onIngenVed={() => { p.onAndra({ ved: false }); setVy('kort'); }} onStang={p.onStang} />;
  }
  if (vy === 'fragor') {
    return <FragorVy namn={p.namn} start={fragorStart} harDu={p.harDu} varningar={p.varningar} avNamn={p.avNamn} onHarDu={p.onHarDu} onTillbaka={() => setVy('kort')} />;
  }
  /** öppna Har du …-vyn på första obesvarade frågan (alla besvarade: den första, så svaren går att ändra) */
  const oppnaFragor = () => {
    const forsta = HAR_DU_FRAGOR.findIndex((f) => !p.harDu[f.id]);
    setFragorStart(forsta >= 0 ? forsta : 0);
    setVy('fragor');
  };

  const pg = p.prognos;
  const skordareEgen = utforareLage(p.skordare) === 'egen';
  const skotareEgen = utforareLage(p.skotare) === 'egen';
  const harAllt = status.prognos.lage === 'ogodkand' && status.prognos.saknas.length === 0;
  const godkand = status.prognos.lage === 'godkand';
  // Godkänd förut men underlaget är ändrat sedan (fingeravtrycket stämmer inte) och allt finns att godkänna igen.
  const godkandOgiltigt = status.prognos.lage === 'ogodkand' && harAllt && p.prognos.godkandAt != null;
  const prognosUppmaning = status.prognos.lage === 'ogodkand' && status.prognos.saknas.length > 0 ? `Saknar ${status.prognos.saknas[0]}` : 'Granska';
  const aktiv = (c: CellId) => cell === c;
  const oppnaCell = (c: CellId) => () => setCell(c);
  const klarCell = (c: CellId) => () => setCell((x) => (x === c ? null : x));

  // Ett område står i "Behöver dig" så länge det är kvar — och så länge det är den utfällda raden (så ett fält man skriver i inte försvinner mitt i en siffra).
  const iBehover = (x: Post) => x.kvar || oppen === x.id;
  const forutsKvar = status.forutsattningarKvar;
  const forutsIBehover = forutsKvar > 0 || oppen === 'forutsattningar';
  /** Ett val av bärighet/terräng/avstånd: sparas, och är alla tre valda fälls raden ihop (området är klart och flyttar ner). */
  const valForutsattning = (patch: { barighet?: string | null; terrang?: string | null; skotningsavstand?: string | null }) => {
    p.onAndra(patch);
    const efter = { barighet: p.barighet, terrang: p.terrang, skotningsavstand: p.skotningsavstand, ...patch };
    if (efter.barighet && efter.terrang && efter.skotningsavstand) stangRad('forutsattningar');
  };
  const harDuBesvarade = HAR_DU_FRAGOR.filter((f) => p.harDu[f.id]).length;
  const behoverFragor = HAR_DU_FRAGOR.filter((f) => !p.harDu[f.id]);
  const varningarFor = (id: HarDuId) => p.varningar.filter((v) => v.fraga === id);

  // Behöver dig, i fast ordning (Förutsättningar där bärighet stod, Har du … sist). Klara områden är inte med.
  const BEHOVER_ORDNING: Array<PostId | 'forutsattningar'> = ['avlagg', 'basvag', 'forutsattningar', 'skordare', 'skotare', 'medelstam', 'prognos'];
  const behoverIds = BEHOVER_ORDNING.filter((id) => (id === 'forutsattningar' ? forutsIBehover : iBehover(post(id))));
  const harDuIBehover = behoverFragor.length > 0;
  const antalBehover = behoverIds.length + (harDuIBehover ? 1 : 0);

  // "Appen har fyllt i": det som är klart. Medelstam står här när den kom ur traktdirektivet (eller är skriven); saknas den står den i Behöver dig. Prognosen bor i prognoskortet.
  const APPEN_ORDNING: Array<PostId | 'forutsattningar'> = ['avlagg', 'basvag', 'forutsattningar', 'skordare', 'skotare', 'medelstam'];
  const appenKlara = APPEN_ORDNING.filter((id) => (id === 'forutsattningar' ? !forutsIBehover : !iBehover(post(id))));

  // Markägare & övrigt: hur många rader avviker från standard (räknas aldrig som "kvar")
  const avvikelser = [
    p.ovrigt.ved, p.ovrigt.bandSkordare === true, p.ovrigt.bandSkotare === true, p.ovrigt.breddat, p.ovrigt.visaKonfiguration && p.ovrigt.konfiguration === 'smal',
    p.ovrigt.risDirekt, p.ovrigt.extraVagn, !p.ovrigt.trailerIn, p.ovrigt.manuellFallning,
  ].filter(Boolean).length;

  const rullaTillPrognos = () => prognosRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });

  // Innehållet i en utfällbar post (samma som förut — bara flyttat dit posten står just nu)
  const postRad = (x: Post, forst: boolean) => {
    const id = x.id;
    switch (id) {
      case 'avlagg':
        return <PostRad key={id} forst={forst} post={x} uppmaning="Placera på kartan" oppen={false} onToggle={p.onPlaceraAvlagg} />;
      case 'basvag':
        return (
          <PostRad key={id} forst={forst} post={x} uppmaning="Rita" oppen={oppen === 'basvag'} onToggle={() => vaxla('basvag')}
            varde={p.basvag.texter.length > 0 ? (p.basvag.sammanfattning ?? x.varde) : x.varde}
            under={x.kvar ? 'Vida har en basväg i underlaget — den är inte ritad än' : p.basvag.kravs ? `Kräver basvägsanläggning${p.basvag.timmar ? ` · ${p.basvag.timmar} tim` : ''}` : undefined}>
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
        );
      case 'skordare':
        return <PostRad key={id} forst={forst} post={medMaskinnamn(x, p.skordare, p.maskiner.skordare)} uppmaning="Välj" oppen={oppen === id} onToggle={() => vaxla(id)}><UtforareRad roll="skordare" onKlart={() => stangRad('skordare')} v={p.skordare} maskiner={p.maskiner.skordare} onVal={(u) => p.onAndra({ skordare: u })} /></PostRad>;
      case 'skotare':
        return <PostRad key={id} forst={forst} post={medMaskinnamn(x, p.skotare, p.maskiner.skotare)} uppmaning="Välj" oppen={oppen === id} onToggle={() => vaxla(id)}><UtforareRad roll="skotare" onKlart={() => stangRad('skotare')} v={p.skotare} maskiner={p.maskiner.skotare} onVal={(u) => p.onAndra({ skotare: u })} /></PostRad>;
      case 'medelstam':
        return (
          <PostRad key={id} forst={forst} post={x} uppmaning="Skriv" oppen={oppen === id} onToggle={() => vaxla(id)}
            under={x.kvar ? 'Saknas i traktdirektivet — förslaget räknar då snitt över alla trakter' : undefined}>
            <div data-testid="klar-medelstam-redigera">
              <Etikett>Medelstam, m³fub per stam</Etikett>
              <Falt testid="klar-medelstam-falt" label="Medelstam" numeriskt placeholder="t.ex. 0,72" value={pg.medelstam} onChange={(v) => p.onAndra({ medelstam: v })} onKlart={() => stangRad('medelstam')} />
            </div>
          </PostRad>
        );
      case 'prognos':
        // Prognosen redigeras i prognoskortet — raden här pekar bara dit så att "N saker kvar" och listan alltid är samma sak.
        return <PostRad key={id} forst={forst} post={x} uppmaning={prognosUppmaning} oppen={false} onToggle={rullaTillPrognos} />;
      default:
        return null;
    }
  };
  /** Förutsättningar-raden (samma i Behöver dig och i Appen har fyllt i) */
  const forutsRad = (forst: boolean) => (
    <ForutsRad key="forutsattningar" forst={forst} kvar={forutsKvar} oppen={oppen === 'forutsattningar'} onToggle={() => vaxla('forutsattningar')}
      barighet={p.barighet} terrang={p.terrang} skotningsavstand={p.skotningsavstand} onVal={valForutsattning} />
  );

  // Rubrikens rad under namnet: läget i ord (färg + ord). Arealen står bara i prognoskortet, där den kan rättas.
  const lageText = planerad ? 'Klar för maskin ✓' : status.klar ? 'Allt klart ✓' : `${status.antalKvar} ${status.antalKvar === 1 ? 'sak' : 'saker'} kvar`;
  const lageFarg = planerad || status.klar ? FARG.gron : FARG.orange;
  const undertitel = (
    <>
      <span data-testid="klar-status" style={{ color: lageFarg, ...TYP.listtitel }}>{lageText}</span>
      {planerad && status.antalKvar > 0 && <span style={{ color: FARG.orange }}> · {status.antalKvar} kvar</span>}
    </>
  );

  // Prognoskortet
  const volymTal = tal(pg.volym);
  const msTal = tal(pg.medelstam);
  const extern = status.prognos.lage === 'extern';
  const maskinRad = (roll: 'skordare' | 'skotare', etikett: string, egen: boolean, v: UtforareVal, mp: MaskinPrognos) => {
    const lage = utforareLage(v);
    return (
      <div key={roll} data-testid={`klar-${roll}-tid`} style={{ display: 'contents' }}>
        <div style={{ ...TYP.text, color: FARG.text, alignSelf: 'center' }}>{etikett}</div>
        {egen ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
              <TalCell id={roll === 'skordare' ? 'skordartimmar' : 'skotartimmar'} aktiv={aktiv(roll)} onAktiv={oppnaCell(roll)} onKlart={klarCell(roll)} varde={mp.tim} onChange={(t) => p.onAndra(roll === 'skordare' ? { skordareTimmar: t } : { skotareTimmar: t })} label={`${etikett}, G15-timmar`} tom="Skriv">{mp.tim.trim()}</TalCell>
              {mp.andrad && mp.forslag && <span data-testid={`klar-${roll}-andrad`} style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>förslag {mp.forslag.g15}</span>}
            </div>
            <div data-testid={`klar-${roll}-prestation`} style={{ ...TYP.listtitel, ...TNUM, color: mp.prestation != null ? FARG.text : FARG.text3, textAlign: 'right', alignSelf: 'center', paddingRight: AVSTAND.m }}>{mp.prestation != null ? fmtPrestation(mp.prestation) : '–'}</div>
          </>
        ) : (
          <div style={{ gridColumn: '2 / 4', ...TYP.meta, color: FARG.text2, textAlign: 'right', alignSelf: 'center', paddingRight: AVSTAND.m }}>{lage === 'extern' ? `Extern · ${v.externNamn.trim()}` : 'Välj maskin ovan'}</div>
        )}
        {/* Intervall + underlag ("troligen 39–46 · ur 7 trakter …") visas först när man trycker på siffran: de behövs när man ska ändra den, inte när man bara läser. */}
        {egen && aktiv(roll) && mp.forslag && (
          <div data-testid={`klar-${roll}-kalla`} style={{ gridColumn: '1 / -1', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{etikett} · {mp.forslag.kalla}</div>
        )}
      </div>
    );
  };
  // Inget förslag att visa (för få jämförbara trakter): står kvar hela tiden — cellen är tom och orange, och här står varför.
  const saknasRad = (roll: 'skordare' | 'skotare', etikett: string, egen: boolean, mp: MaskinPrognos) =>
    egen && !mp.forslag && mp.saknas
      ? <div key={roll} data-testid={`klar-${roll}-forslag-saknas`} style={{ overflowWrap: 'anywhere' }}>{etikett} · {mp.saknas}</div>
      : null;
  const saknasRader = [saknasRad('skordare', 'Skördare', skordareEgen, pg.skordare), saknasRad('skotare', 'Skotare', skotareEgen, pg.skotare)].filter(Boolean);
  // Medelstam saknas och förslaget är snitt över alla trakter av typen: Stämmer går ändå att trycka, och kortet säger vad talen vilar på.
  const snittOver = !extern && msTal == null ? ((skordareEgen ? pg.skordare.forslag?.snittOver : undefined) ?? (skotareEgen ? pg.skotare.forslag?.snittOver : undefined)) : undefined;

  return (
    <>
      <Huvud titel={p.namn} undertitel={undertitel} onStang={p.onStang} />
      <div data-testid="klar-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.m}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
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

        {/* ── 1. BEHÖVER DIG — syns bara när något är kvar; korta rader med orange värde + pil ──────────────────────────────── */}
        {antalBehover > 0 && (
          <section data-testid="klar-behover" style={{ marginBottom: AVSTAND.sektion }}>
            <Rubrik>Behöver dig</Rubrik>
            <Gruppkort testid="klar-del1">
              {behoverIds.map((id, k) => (id === 'forutsattningar' ? forutsRad(k === 0) : postRad(post(id), k === 0)))}
              {/* Är bara EN fråga kvar står den direkt i listan; annars en rad som öppnar en fråga i taget */}
              {harDuIBehover && behoverFragor.length === 1 && (
                <FragaBlock f={behoverFragor[0]} svar={undefined} varningar={varningarFor(behoverFragor[0].id)} avNamn={p.avNamn} onHarDu={p.onHarDu} forst={behoverIds.length === 0} />
              )}
              {harDuIBehover && behoverFragor.length > 1 && (
                <VyRad id="hardu" etikett="Har du …" varde={`${harDuBesvarade} av ${HAR_DU_FRAGOR.length}`} kvar onTryck={oppnaFragor} forst={behoverIds.length === 0} />
              )}
            </Gruppkort>
          </section>
        )}

        {/* ── 2. PROGNOSKORTET ─────────────────────────────────────────────────────────────────────────────────── */}
        <section ref={prognosRef} data-testid="klar-prognoskort" style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: AVSTAND.l, marginBottom: AVSTAND.sektion }}>
          {extern ? (
            <div data-testid="klar-prognos-extern" style={{ ...TYP.text, color: FARG.text2 }}>Extern utförare på båda — inget att prognostisera</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: AVSTAND.m }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...TYP.meta, color: FARG.text2 }}>Volym</div>
                  {aktiv('volym')
                    ? <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><div style={{ width: 144 }}><Falt testid="klar-volym" label="Volym, m³fub" numeriskt kompakt value={pg.volym} onChange={(v) => p.onAndra({ volym: v })} onKlart={klarCell('volym')} /></div><span style={{ ...TYP.meta, color: FARG.text2 }}>m³fub</span></div>
                    : <TalCell id="volym" stor aktiv={false} onAktiv={oppnaCell('volym')} onKlart={klarCell('volym')} varde={pg.volym} onChange={() => {}} label="Volym, m³fub" tom="Skriv volym" align="left">
                        <span style={{ ...TYP.tal }}>{volymTal != null ? sv(volymTal) : pg.volym}</span><span style={{ ...TYP.text, color: FARG.text2 }}> m³fub</span>
                      </TalCell>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                  <div style={{ ...TYP.meta, color: FARG.text2 }}>medelstam</div>
                  {aktiv('medelstam')
                    ? <div style={{ width: 96 }}><Falt testid="klar-medelstam" label="Medelstam, m³fub per stam" numeriskt kompakt value={pg.medelstam} onChange={(v) => p.onAndra({ medelstam: v })} onKlart={klarCell('medelstam')} /></div>
                    : <TalCell id="medelstam" stor aktiv={false} onAktiv={oppnaCell('medelstam')} onKlart={klarCell('medelstam')} varde={pg.medelstam} onChange={() => {}} label="Medelstam, m³fub per stam" tom="saknas">
                        <span style={{ ...TYP.rubrik, ...TNUM }}>{msTal != null ? msTal.toFixed(2).replace('.', ',') : pg.medelstam}</span>
                      </TalCell>}
                  {aktiv('areal')
                    ? <div style={{ width: 96, marginTop: AVSTAND.xs }}><Falt testid="klar-areal" label="Areal, ha" numeriskt kompakt value={pg.areal} onChange={(v) => p.onAndra({ areal: v })} onKlart={klarCell('areal')} /></div>
                    : <TalCell id="areal" stor aktiv={false} onAktiv={oppnaCell('areal')} onKlart={klarCell('areal')} varde={pg.areal} onChange={() => {}} label="Areal, ha" tom="areal saknas">
                        <span style={{ ...TYP.meta, color: FARG.text2 }}>{pg.areal.trim()} ha</span>
                      </TalCell>}
                </div>
              </div>

              <div data-testid="klar-prognos-tabell" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px 104px', columnGap: AVSTAND.xs, rowGap: AVSTAND.xs, marginTop: AVSTAND.m, paddingTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` }}>
                <div />
                <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'right', paddingRight: AVSTAND.m }}>G15-tim</div>
                <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'right', paddingRight: AVSTAND.m }}>m³fub/G15</div>
                {maskinRad('skordare', 'Skördare', skordareEgen, p.skordare, pg.skordare)}
                {maskinRad('skotare', 'Skotare', skotareEgen, p.skotare, pg.skotare)}
              </div>

              {snittOver && (
                <div data-testid="klar-prognos-snitt" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.m }}>Snitt över alla {snittOver} – blir säkrare med medelstam</div>
              )}
              {saknasRader.length > 0 && <div data-testid="klar-prognos-kallor" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.m, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>{saknasRader}</div>}
              {status.prognos.lage === 'ogodkand' && status.prognos.saknas.length > 0 && (
                <div data-testid="klar-prognos-saknas" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Saknar: {status.prognos.saknas.join(', ')}</div>
              )}

              <button type="button" data-testid="klar-stammer" data-godkand={godkand ? '1' : '0'} onClick={p.onStammer} disabled={!harAllt && !godkand} className="press-scale"
                style={{ ...(godkand ? KNAPP.sekundar : KNAPP.primar), ...(godkand ? { color: FARG.gron } : harAllt ? null : { opacity: 0.4 }), marginTop: AVSTAND.m, cursor: harAllt || godkand ? 'pointer' : 'default', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                {godkand ? `Stämmer ✓${p.prognos.godkandAv ? ` · ${p.avNamn(p.prognos.godkandAv) ?? ''}` : ''}${p.prognos.godkandAt ? ` ${dagManad(p.prognos.godkandAt)}` : ''}` : 'Stämmer'}
              </button>
              {godkandOgiltigt && <div data-testid="klar-stammer-ogiltigt" role="note" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>Underlaget har ändrats – tryck Stämmer igen</div>}
            </>
          )}
        </section>

        {/* ── 3. DET SOM ÄR KLART — bara det som faktiskt är klart, ingen rubrik ──────────────────────────────────────────── */}
        <Gruppkort testid="klar-del2">
          {appenKlara.length > 0 && (
            <GruppRad id="appen" forst etikett="Appen har fyllt i" sammanfattning={`${appenKlara.length} ${appenKlara.length === 1 ? 'uppgift' : 'uppgifter'}`} oppen={grupp === 'appen'} onToggle={() => vaxlaGrupp('appen')}>
              {appenKlara.map((id, k) => (id === 'forutsattningar' ? forutsRad(false) : postRad(post(id), false)))}
            </GruppRad>
          )}

          {/* Har du … när alla sex är besvarade: raden öppnar frågorna igen så ett svar går att ändra */}
          {!harDuIBehover && (
            <VyRad id="hardu" forst={appenKlara.length === 0} etikett="Har du …" varde={`${harDuBesvarade} av ${HAR_DU_FRAGOR.length}`} kvar={false} onTryck={oppnaFragor} />
          )}

          <GruppRad id="ovrigt" forst={appenKlara.length === 0 && harDuIBehover} etikett="Markägare & övrigt" sammanfattning={avvikelser === 0 ? 'Inga avvikelser' : `${avvikelser} ${avvikelser === 1 ? 'avvikelse' : 'avvikelser'}`} oppen={grupp === 'ovrigt'} onToggle={() => vaxlaGrupp('ovrigt')}>
            <div data-testid="klar-del3">
              <div data-testid="klar-ovrigt-ved" style={{ borderTop: `1px solid ${FARG.linje}` }}>
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
            </div>
          </GruppRad>
        </Gruppkort>
      </div>

      {/* ── KLAR FÖR MASKIN ───────────────────────────────────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.l)}`, borderTop: `1px solid ${FARG.linje}` }}>
        {planerad ? (
          <div data-testid="klar-skickad" style={{ ...TYP.listtitel, color: FARG.gron, textAlign: 'center', minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Klar för maskin ✓
          </div>
        ) : (
          <>
            <button type="button" data-testid="klar-for-maskin" data-klar={status.klar ? '1' : '0'} onClick={p.onKlarForMaskin} disabled={p.klarSparar} className="press-scale"
              style={{ ...KNAPP.primar, background: status.klar ? FARG.gron : FARG.fyllning, color: status.klar ? FARG.bg : FARG.text, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...(p.klarSparar ? { opacity: 0.4 } : null) }}>
              {p.klarSparar ? 'Skickar …' : 'Klar för maskin'}
            </button>
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
