'use client';

// STEGEN i "Klar med trakten?" (GÖRA-läget). Alla steg har samma uppbyggnad — `StegRam`: "‹ traktnamn" + "N av M", framstegsstreck, rubrik, innehåll, stora knappar och
// Föregående / Hoppa över. Varje område som kan vara kvar är ETT steg; "Gå igenom" går genom dem, en rad i "Behöver dig" öppnar bara sitt steg, och en sektion i
// sammanställningen öppnar samma steg för att ändra. Ren presentation: kortet (KlarMedTrakten) äger vilket steg som visas, sidan räknar och sparar.

import React, { useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import {
  BARIGHET_VAL, HAR_DU_FRAGOR, SKOTNINGSAVSTAND_VAL, TERRANG_VAL, utforareLage,
  type HarDuFraga, type HarDuId, type HarDuSvar, type HarDuSvarVarde, type KlarStatus, type UtforareVal, type Varning,
} from '@/lib/klarTrakt';
import { datum, fmtPrestation, komma, sv, tal } from '@/lib/klarFormat';
import { svTal } from '@/lib/objektKort';
import { Pil } from './infoDelar';
import { Etikett, Falt, Val } from './klarDelar';
import type { KlarMedTraktenProps, MaskinAlternativ, MaskinPrognos } from './KlarMedTrakten';

// ── Ramen ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Stor knapp (60 pt) — primär = vit, sekundär = grå, grön = Klar för maskin. */
export function StorKnapp({ testid, onTryck, variant = 'primar', disabled = false, pressed, children }: {
  testid?: string; onTryck: () => void; variant?: 'primar' | 'sekundar' | 'gron'; disabled?: boolean; pressed?: boolean; children: React.ReactNode;
}) {
  const bg = variant === 'gron' ? FARG.gron : variant === 'primar' ? FARG.text : FARG.fyllning;
  const fg = variant === 'sekundar' ? FARG.text : FARG.bg;
  return (
    <button type="button" data-testid={testid} aria-pressed={pressed} disabled={disabled} onClick={onTryck} className="press-scale"
      style={{ width: '100%', minHeight: 60, borderRadius: RADIE.kort, border: 'none', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', background: bg, color: fg, ...TYP.rubrik, ...(disabled ? { opacity: 0.4 } : null) }}>
      {children}
    </button>
  );
}

export interface StegRamProps {
  namn: string;
  onTillbaka: () => void;
  /** framstegsstreck + "N av M" (visas bara när det finns fler än en del) */
  delar?: { antal: number; nu: number } | null;
  kicker?: string;
  rubrik: string;
  /** en rad under rubriken (t.ex. "Svarat Martin · 15 okt") */
  under?: React.ReactNode;
  /** innehållet centreras lodrätt (en fråga) i stället för att börja överst */
  centrerat?: boolean;
  /** delstatus för strecket: 'besvarad' | 'kvar' per del (annars bara nuvarande markerad) */
  delStatus?: (i: number) => 'klar' | 'kvar';
  knappar: React.ReactNode;
  foregaende?: { onTryck: () => void; disabled?: boolean } | null;
  hoppa?: { onTryck: () => void } | null;
  testid?: string;
  children?: React.ReactNode;
}

export function StegRam({ namn, onTillbaka, delar, kicker, rubrik, under, centrerat = false, delStatus, knappar, foregaende, hoppa, testid = 'klar-steg', children }: StegRamProps) {
  const flerDelar = delar != null && delar.antal > 1;
  return (
    <div data-testid={testid} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: `0 ${AVSTAND.l}px` }}>
        <button type="button" data-testid="klar-steg-tillbaka" onClick={onTillbaka}
          style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, minHeight: TRAFFYTA.min, marginLeft: -AVSTAND.xs, padding: `0 ${AVSTAND.xs}px`, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', minWidth: 0, ...TYP.text }}>
          <Pil vanster />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{namn}</span>
        </button>
        <span style={{ flex: 1 }} />
        {flerDelar && <span data-testid="klar-steg-rakneverk" style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{delar!.nu + 1} av {delar!.antal}</span>}
      </div>
      {flerDelar && (
        <div data-testid="klar-steg-framsteg" style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: `repeat(${delar!.antal}, minmax(0, 1fr))`, gap: AVSTAND.xs, padding: `${AVSTAND.s}px ${AVSTAND.l}px 0` }}>
          {Array.from({ length: delar!.antal }, (_, k) => (
            <div key={k} data-delsteg={k === delar!.nu ? 'nu' : delStatus ? (delStatus(k) === 'klar' ? 'besvarad' : 'kvar') : k < delar!.nu ? 'besvarad' : 'kvar'}
              style={{ height: AVSTAND.xs, borderRadius: RADIE.rad, background: k === delar!.nu ? FARG.text : (delStatus ? delStatus(k) === 'klar' : k < delar!.nu) ? FARG.gron : FARG.fyllning }} />
          ))}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', justifyContent: centrerat ? 'center' : 'flex-start', gap: AVSTAND.m, padding: `${AVSTAND.l}px ${AVSTAND.xl}px ${AVSTAND.xxl}px` }}>
        <div>
          {kicker && <div data-testid="klar-steg-kicker" style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.xs }}>{kicker}</div>}
          <h2 data-testid="klar-steg-rubrik" style={{ margin: 0, ...TYP.titel, color: FARG.text, overflowWrap: 'anywhere' }}>{rubrik}</h2>
          {under && <div data-testid="klar-steg-under" style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{under}</div>}
        </div>
        {children}
      </div>
      <div style={{ flexShrink: 0, padding: `0 ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>{knappar}</div>
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px ${AVSTAND.m}px ${medSafeBotten(AVSTAND.l)}` }}>
        {foregaende ? (
          <button type="button" data-testid="klar-steg-foregaende" disabled={foregaende.disabled} onClick={foregaende.onTryck} className="press-dim"
            style={{ ...KNAPP.tertiar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...(foregaende.disabled ? { opacity: 0.4 } : null) }}>Föregående</button>
        ) : <span />}
        {hoppa ? (
          <button type="button" data-testid="klar-steg-hoppa" onClick={hoppa.onTryck} className="press-dim"
            style={{ ...KNAPP.tertiar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>Hoppa över</button>
        ) : <span />}
      </div>
    </div>
  );
}

// ── Delade byggstenar ────────────────────────────────────────────────────────────────────────────────────────────────

/** iOS-segmentknapp med tre val. Etiketten är orange så länge inget är valt. Samma val igen tar tillbaka svaret. */
export function Segment({ id, etikett, val, vald, onVal }: { id: string; etikett: string; val: ReadonlyArray<{ id: string; namn: string }>; vald: string | null; onVal: (v: string | null) => void }) {
  return (
    <div data-testid={`klar-seg-${id}`} data-vald={vald ? '1' : '0'}>
      <div data-testid={`klar-seg-${id}-etikett`} style={{ ...TYP.meta, color: vald ? FARG.text2 : FARG.orange, margin: `0 ${AVSTAND.xs}px ${AVSTAND.xs}px` }}>{etikett}</div>
      <div role="group" aria-label={etikett} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: AVSTAND.xs, background: FARG.fyllning, borderRadius: RADIE.rad, padding: AVSTAND.xs }}>
        {val.map((v) => (
          <button key={v.id} type="button" data-testid={`klar-${id}-${v.id}`} aria-pressed={vald === v.id} onClick={() => onVal(vald === v.id ? null : v.id)} className="press-scale"
            style={{ minHeight: TRAFFYTA.primar, border: 'none', borderRadius: RADIE.rad, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
              background: vald === v.id ? FARG.text : 'transparent', color: vald === v.id ? FARG.bg : FARG.text, ...(vald === v.id ? TYP.listtitel : TYP.text) }}>
            {v.namn}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Egen maskin (lista) eller extern (namn) för en roll. */
export function UtforareRad({ roll, v, maskiner, onVal }: { roll: 'skordare' | 'skotare'; v: UtforareVal; maskiner: MaskinAlternativ[]; onVal: (u: UtforareVal) => void }) {
  const extern = v.utforare === 'extern';
  const egen = !extern && (v.maskinId != null || v.utforare === 'egen');
  return (
    <div data-testid={`klar-${roll}-val`}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s, marginBottom: AVSTAND.s }}>
        <Val testid={`klar-${roll}-egen`} vald={egen} onTryck={() => onVal({ maskinId: v.maskinId, utforare: 'egen', externNamn: '' })}>Egen</Val>
        <Val testid={`klar-${roll}-extern`} vald={extern} onTryck={() => onVal({ maskinId: null, utforare: 'extern', externNamn: v.externNamn })}>Extern</Val>
      </div>
      {extern ? (
        <Falt testid={`klar-${roll}-extern-namn`} label={`Namn på extern ${roll === 'skordare' ? 'skördare' : 'skotare'}`} placeholder="Namn på utföraren" value={v.externNamn} onChange={(n) => onVal({ maskinId: null, utforare: 'extern', externNamn: n })} />
      ) : egen ? (
        <div data-testid={`klar-${roll}-maskiner`} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          {maskiner.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>Inga maskiner av rätt typ är registrerade.</div>}
          {maskiner.map((m) => <Val key={m.id} testid={`klar-${roll}-maskin-${m.id}`} vald={v.maskinId === m.id} onTryck={() => onVal({ maskinId: m.id, utforare: null, externNamn: '' })} ton={m.varning ? 'orange' : undefined}>{m.namn}{m.varning ? ` · ${m.varning}` : ''}</Val>)}
        </div>
      ) : (
        <div style={{ ...TYP.meta, color: FARG.text2, marginLeft: AVSTAND.xs }}>Välj egen maskin eller extern utförare.</div>
      )}
    </div>
  );
}

/** Raden säger VILKEN maskin det är (inte bara "Egen"). Okänt maskin-id → "Egen". */
export function maskinNamnFor(u: UtforareVal, lista: MaskinAlternativ[]): string {
  const l = utforareLage(u);
  if (l === 'extern') return `Extern · ${u.externNamn.trim()}`;
  if (l === 'egen') return lista.find((m) => m.id === u.maskinId)?.namn ?? 'Egen';
  return 'Ej vald';
}

/** Ett tal i prognosen som går att trycka på: visar talet — tryck byter det mot ett fält PÅ PLATS. */
export function TalCell({ id, aktiv, onAktiv, onKlart, varde, onChange, label, tom, align = 'right', stor = false, children }: {
  id: string; aktiv: boolean; onAktiv: () => void; onKlart: () => void; varde: string; onChange: (v: string) => void; label: string;
  tom: string; align?: 'left' | 'right'; stor?: boolean; children: React.ReactNode;
}) {
  if (aktiv) return <Falt testid={`klar-${id}`} label={label} numeriskt kompakt value={komma(varde)} onChange={onChange} onKlart={onKlart} />;
  const saknas = varde.trim() === '';
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

/**
 * En rad i Markägare & övrigt: ETT tryck växlar. Etiketten är ALLTID vit vanlig text (grå text läses som avstängd rad) — bara knappen till höger visar läget:
 * grå fyllning = standard, vit fyllning = avviker.
 */
export function OvrigRad({ id, etikett, varde, standard = false, onVal, ord, under, children }: {
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

/** 1 par / 2 par under en band-rad som är på. */
export function ParVal({ id, vald, onVal }: { id: string; vald: string | null; onVal: (v: string | null) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.xs, paddingBottom: AVSTAND.s }}>
      {[{ id: '1', namn: '1 par' }, { id: '2', namn: '2 par' }].map((o) => <Val key={o.id} testid={`klar-par-${id}-${o.id}`} vald={vald === o.id} onTryck={() => onVal(vald === o.id ? null : o.id)}>{o.namn}</Val>)}
    </div>
  );
}

const Varningsruta = ({ id, text }: { id: string; text: string }) => (
  <div data-testid={`klar-varning-${id}`} role="note" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.rad, background: FARG.fyllning }}>
    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.text, color: FARG.orange, flexShrink: 0 }}>warning</span>
    <span style={{ ...TYP.meta, color: FARG.orange, overflowWrap: 'anywhere' }}>{text}</span>
  </div>
);

// ── Innehållet i de enkla stegen ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Avlägg. Knappen som gör stegets sak är PRIMÄR (vit) tills den är gjord — då blir Nästa primär och den här sekundär; aldrig två vita samtidigt.
 * Utan Vida-avlägg: "Placera på kartan" → "Avlägg placerat ✓". Med Vidas avlägg: "Vidas avlägg: 01-1, 01-2" + Stämmer (primär) och Flytta / Lägg till (sekundära);
 * Flytta och Lägg till placerar båda ett eget avlägg (Vidas punkt i underlaget rörs aldrig).
 */
export function AvlaggBody({ p, kartaYta }: { p: KlarMedTraktenProps; kartaYta?: React.ReactNode }) {
  const post = p.status.poster.find((x) => x.id === 'avlagg')!;
  const vida = p.vidaAvlagg ?? [];
  if (vida.length === 0) {
    return (
      <>
        {kartaYta}
        {!post.kvar && <div data-testid="klar-avlagg-status" style={{ ...TYP.text, color: FARG.text }}>Avlägg placerat ✓</div>}
        <StorKnapp testid="klar-avlagg-placera" variant={post.kvar ? 'primar' : 'sekundar'} onTryck={p.onPlaceraAvlagg}>{post.kvar ? 'Placera på kartan' : 'Placera ett till'}</StorKnapp>
      </>
    );
  }
  const bekraftat = p.vidaAvlaggBekraftat === true;
  return (
    <>
      {kartaYta}
      <div data-testid="klar-avlagg-vida" style={{ ...TYP.text, color: FARG.text }}>Vidas avlägg: {vida.join(', ')}{p.avlaggEgna ? ` · ${p.avlaggEgna === 1 ? '1 eget' : `${p.avlaggEgna} egna`}` : ''}</div>
      {post.kvar
        ? <StorKnapp testid="klar-avlagg-stammer" onTryck={() => p.onBekraftaVidaAvlagg?.()}>Stämmer</StorKnapp>
        : <div data-testid="klar-avlagg-status" style={{ ...TYP.text, color: FARG.text }}>{bekraftat ? 'Vidas avlägg bekräftade ✓' : 'Avlägg placerat ✓'}</div>}
      <StorKnapp testid="klar-avlagg-flytta" variant="sekundar" onTryck={p.onPlaceraAvlagg}>Flytta</StorKnapp>
      <StorKnapp testid="klar-avlagg-placera" variant="sekundar" onTryck={p.onPlaceraAvlagg}>Lägg till</StorKnapp>
    </>
  );
}

export function BasvagBody({ p }: { p: KlarMedTraktenProps }) {
  const post = p.status.poster.find((x) => x.id === 'basvag')!;
  return (
    <div data-testid="klar-basvag-redigera" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      <div style={{ ...TYP.text, color: post.kvar ? FARG.text2 : FARG.text }}>
        {post.kvar ? 'Vida har en basväg i underlaget — den är inte ritad än.' : p.basvag.texter.length > 0 ? (p.basvag.sammanfattning ?? post.varde) : 'Ingen basväg på den här trakten.'}
      </div>
      <StorKnapp testid="klar-basvag-rita" variant={post.kvar ? 'primar' : 'sekundar'} onTryck={p.onRitaBasvag}>{p.basvag.texter.length > 0 ? 'Rita en basväg till' : 'Rita basväg'}</StorKnapp>
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
          <Falt testid="klar-basvag-timmar" label="Timmar för basvägsanläggning" numeriskt placeholder="t.ex. 6" value={komma(p.basvag.timmar)} onChange={(v) => p.onAndra({ basvagTimmar: v })} />
        </>
      )}
    </div>
  );
}

export function ForutsBody({ p }: { p: KlarMedTraktenProps }) {
  return (
    <div data-testid="klar-forutsattningar-redigera" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
      <Segment id="barighet" etikett="Bärighet" val={BARIGHET_VAL} vald={p.barighet} onVal={(v) => p.onAndra({ barighet: v })} />
      <Segment id="terrang" etikett="Terräng" val={TERRANG_VAL} vald={p.terrang} onVal={(v) => p.onAndra({ terrang: v })} />
      <Segment id="skotningsavstand" etikett="Skotningsavstånd" val={SKOTNINGSAVSTAND_VAL} vald={p.skotningsavstand} onVal={(v) => p.onAndra({ skotningsavstand: v })} />
    </div>
  );
}

export function MaskinerBody({ p }: { p: KlarMedTraktenProps }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
      <div>
        <Etikett>Skördare</Etikett>
        <UtforareRad roll="skordare" v={p.skordare} maskiner={p.maskiner.skordare} onVal={(u) => p.onAndra({ skordare: u })} />
      </div>
      <div>
        <Etikett>Skotare</Etikett>
        <UtforareRad roll="skotare" v={p.skotare} maskiner={p.maskiner.skotare} onVal={(u) => p.onAndra({ skotare: u })} />
      </div>
    </div>
  );
}

export function MedelstamBody({ p }: { p: KlarMedTraktenProps }) {
  return (
    <div data-testid="klar-medelstam-redigera">
      <Etikett>Medelstam, m³fub per stam</Etikett>
      <Falt testid="klar-medelstam-falt" label="Medelstam" numeriskt placeholder="t.ex. 0,72" value={komma(p.prognos.medelstam)} onChange={(v) => p.onAndra({ medelstam: v })} />
      <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>Saknas i traktdirektivet. Utan den räknar förslaget snitt över alla trakter av typen.</div>
    </div>
  );
}

// ── Prognos: siffrorna stort ─────────────────────────────────────────────────────────────────────────────────────────

type CellId = 'volym' | 'medelstam' | 'areal' | 'skordare' | 'skotare';

export function PrognosBody({ p }: { p: KlarMedTraktenProps }) {
  const [cell, setCell] = useState<CellId | null>(null);
  const pg = p.prognos;
  const status: KlarStatus = p.status;
  const aktiv = (c: CellId) => cell === c;
  const oppnaCell = (c: CellId) => () => setCell(c);
  const klarCell = (c: CellId) => () => setCell((x) => (x === c ? null : x));
  const godkand = status.prognos.lage === 'godkand';
  const extern = status.prognos.lage === 'extern';
  const volymTal = tal(pg.volym);
  const msTal = tal(pg.medelstam);
  const skordareEgen = utforareLage(p.skordare) === 'egen';
  const skotareEgen = utforareLage(p.skotare) === 'egen';
  const snittOver = !extern && msTal == null ? ((skordareEgen ? pg.skordare.forslag?.snittOver : undefined) ?? (skotareEgen ? pg.skotare.forslag?.snittOver : undefined)) : undefined;

  if (extern) return <div data-testid="klar-prognos-extern" style={{ ...TYP.text, color: FARG.text2 }}>Extern utförare på båda — inget att prognostisera</div>;

  const maskinKort = (roll: 'skordare' | 'skotare', etikett: string, egen: boolean, v: UtforareVal, lista: MaskinAlternativ[], mp: MaskinPrognos) => {
    const lage = utforareLage(v);
    const godkandNu = godkand;
    // Utanför liknande trakter: prestationen orange + en rad under. Syns tills siffran är inom intervallet eller någon tryckt Stämmer (godkänt underlag); Stämmer går alltid att trycka.
    const varn = egen && !godkandNu ? mp.varning : null;
    return (
      <div key={roll} data-testid={`klar-${roll}-tid`} style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m }}>
          <span style={{ ...TYP.listtitel, color: FARG.text }}>{etikett}</span>
          <span style={{ ...TYP.meta, color: FARG.text2, textAlign: 'right' }}>{lage === 'saknas' ? 'Ej vald' : maskinNamnFor(v, lista)}</span>
        </div>
        {egen ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.m, marginTop: AVSTAND.s }}>
              <div>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>G15-tim</div>
                <TalCell id={roll === 'skordare' ? 'skordartimmar' : 'skotartimmar'} stor align="left" aktiv={aktiv(roll)} onAktiv={oppnaCell(roll)} onKlart={klarCell(roll)} varde={mp.tim}
                  onChange={(t) => p.onAndra(roll === 'skordare' ? { skordareTimmar: t } : { skotareTimmar: t })} label={`${etikett}, G15-timmar`} tom="Skriv">
                  <span style={{ ...TYP.tal }}>{svTal(mp.tim, 1)}</span>
                </TalCell>
                {mp.andrad && mp.forslag && <div data-testid={`klar-${roll}-andrad`} style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>förslag {mp.forslag.g15}</div>}
              </div>
              <div>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>m³fub/G15</div>
                <div data-testid={`klar-${roll}-prestation`} style={{ ...TYP.tal, color: varn ? FARG.orange : mp.prestation != null ? FARG.text : FARG.text3, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }}>{mp.prestation != null ? fmtPrestation(mp.prestation) : '–'}</div>
              </div>
            </div>
            {varn && (
              <div data-testid={`klar-${roll}-varning`} role="note" style={{ ...TYP.meta, color: FARG.orange, overflowWrap: 'anywhere', marginTop: AVSTAND.xs }}>
                {varn.riktning === 'lagt' ? 'Lågt' : 'Högt'} – liknande trakter {fmtPrestation(varn.lag)}–{fmtPrestation(varn.hog)} m³fub/G15
              </div>
            )}
            {/* Intervall + underlag ("troligen 39–46 · ur 7 trakter …") visas först när man trycker på siffran: de behövs när man ska ändra den, inte när man bara läser. */}
            {aktiv(roll) && mp.forslag && (
              <div data-testid={`klar-${roll}-kalla`} style={{ ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere', marginTop: AVSTAND.xs }}>{etikett} · {mp.forslag.kalla}</div>
            )}
            {!mp.forslag && mp.saknas && (
              <div data-testid={`klar-${roll}-forslag-saknas`} style={{ ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere', marginTop: AVSTAND.xs }}>{etikett} · {mp.saknas}</div>
            )}
          </>
        ) : (
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{lage === 'extern' ? 'Extern utförare — inga timmar att prognostisera' : 'Välj maskin först'}</div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* volym · medelstam · areal — tryck på en siffra för att ändra den på plats */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: AVSTAND.m }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>Volym</div>
          {aktiv('volym')
            ? <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><div style={{ width: 144 }}><Falt testid="klar-volym" label="Volym, m³fub" numeriskt kompakt value={komma(pg.volym)} onChange={(v) => p.onAndra({ volym: v })} onKlart={klarCell('volym')} /></div><span style={{ ...TYP.meta, color: FARG.text2 }}>m³fub</span></div>
            : <TalCell id="volym" stor aktiv={false} onAktiv={oppnaCell('volym')} onKlart={klarCell('volym')} varde={pg.volym} onChange={() => {}} label="Volym, m³fub" tom="Skriv volym" align="left">
                <span style={{ ...TYP.rubrik, ...TNUM }}>{volymTal != null ? sv(volymTal) : pg.volym}</span><span style={{ ...TYP.text, color: FARG.text2 }}> m³fub</span>
              </TalCell>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>medelstam</div>
          {aktiv('medelstam')
            ? <div style={{ width: 96 }}><Falt testid="klar-medelstam" label="Medelstam, m³fub per stam" numeriskt kompakt value={komma(pg.medelstam)} onChange={(v) => p.onAndra({ medelstam: v })} onKlart={klarCell('medelstam')} /></div>
            : <TalCell id="medelstam" stor aktiv={false} onAktiv={oppnaCell('medelstam')} onKlart={klarCell('medelstam')} varde={pg.medelstam} onChange={() => {}} label="Medelstam, m³fub per stam" tom="saknas">
                <span style={{ ...TYP.rubrik, ...TNUM }}>{msTal != null ? msTal.toFixed(2).replace('.', ',') : pg.medelstam}</span>
              </TalCell>}
          {aktiv('areal')
            ? <div style={{ width: 96, marginTop: AVSTAND.xs }}><Falt testid="klar-areal" label="Areal, ha" numeriskt kompakt value={komma(pg.areal)} onChange={(v) => p.onAndra({ areal: v })} onKlart={klarCell('areal')} /></div>
            : <TalCell id="areal" stor aktiv={false} onAktiv={oppnaCell('areal')} onKlart={klarCell('areal')} varde={pg.areal} onChange={() => {}} label="Areal, ha" tom="areal saknas">
                <span style={{ ...TYP.meta, color: FARG.text2 }}>{svTal(pg.areal, 2)} ha</span>
              </TalCell>}
        </div>
      </div>

      {maskinKort('skordare', 'Skördare', skordareEgen, p.skordare, p.maskiner.skordare, pg.skordare)}
      {maskinKort('skotare', 'Skotare', skotareEgen, p.skotare, p.maskiner.skotare, pg.skotare)}

      {snittOver && <div data-testid="klar-prognos-snitt" style={{ ...TYP.meta, color: FARG.text2 }}>Snitt över alla {snittOver} – blir säkrare med medelstam</div>}
      {status.prognos.lage === 'ogodkand' && status.prognos.saknas.length > 0 && (
        <div data-testid="klar-prognos-saknas" style={{ ...TYP.meta, color: FARG.text2 }}>Saknar: {status.prognos.saknas.join(', ')}</div>
      )}
    </>
  );
}

// ── Har du …: en fråga i taget ───────────────────────────────────────────────────────────────────────────────────────

export function HarDuSteg({ namn, harDu, varningar, avNamn, onHarDu, fraga, ytterDelar, kicker, onTillbaka, onForegaende, onNasta }: {
  namn: string; harDu: HarDuSvar; varningar: Varning[]; avNamn: (id: string | null) => string | null; onHarDu: (id: HarDuId, v: HarDuSvarVarde) => void;
  /** bara EN fråga (öppnad ur sammanställningen): ingen bläddring, svaret går tillbaka */
  fraga?: HarDuId;
  /** "N av M" för hela genomgången; saknas den (en rad i Behöver dig) visas de sex frågorna som delar */
  ytterDelar?: { antal: number; nu: number } | null;
  kicker?: string;
  onTillbaka: () => void;
  /** Föregående på första frågan (genomgången: föregående steg). Saknas → Föregående är grå. */
  onForegaende?: (() => void) | null;
  /** efter sista frågan / Hoppa över på den sista: nästa steg (genomgången) eller tillbaka (ett steg) */
  onNasta: () => void;
}) {
  const enda = fraga != null;
  const start = enda ? Math.max(0, HAR_DU_FRAGOR.findIndex((f) => f.id === fraga)) : Math.max(0, HAR_DU_FRAGOR.findIndex((f) => !harDu[f.id]));
  const [i, setI] = useState(start);
  const f: HarDuFraga = HAR_DU_FRAGOR[i];
  const svar = harDu[f.id];
  const sista = i === HAR_DU_FRAGOR.length - 1;
  const framat = () => { if (enda || sista) onNasta(); else setI(i + 1); };
  const svara = (v: HarDuSvarVarde) => { onHarDu(f.id, v); framat(); };
  const vem = svar ? [avNamn(svar.av), datum(svar.at)].filter(Boolean).join(' · ') : '';
  const delar = enda ? null : (ytterDelar ?? { antal: HAR_DU_FRAGOR.length, nu: i });
  return (
    <StegRam namn={namn} onTillbaka={onTillbaka} delar={delar} centrerat kicker={kicker ?? (ytterDelar ? `HAR DU … · FRÅGA ${i + 1} AV ${HAR_DU_FRAGOR.length}` : undefined)} rubrik={f.fraga}
      under={vem ? <span data-testid="klar-fragor-vem">Svarat {vem}</span> : undefined}
      delStatus={ytterDelar || enda ? undefined : (k) => (harDu[HAR_DU_FRAGOR[k].id] ? 'klar' : 'kvar')}
      testid="klar-fragor-vy"
      foregaende={enda ? null : { onTryck: () => { if (i > 0) setI(i - 1); else onForegaende?.(); }, disabled: i === 0 && !onForegaende }}
      hoppa={enda ? null : { onTryck: framat }}
      knappar={(
        <>
          <StorKnapp testid={`klar-fraga-${f.id}-ja`} pressed={svar?.svar === 'ja'} variant={!svar || svar.svar === 'ja' ? 'primar' : 'sekundar'} onTryck={() => svara('ja')}>{f.ja}</StorKnapp>
          <StorKnapp testid={`klar-fraga-${f.id}-nej`} pressed={svar?.svar === f.nejVarde} variant={svar?.svar === f.nejVarde ? 'primar' : 'sekundar'} onTryck={() => svara(f.nejVarde)}>{f.nej}</StorKnapp>
        </>
      )}>
      {varningar.filter((v) => v.fraga === f.id).map((v, k) => <Varningsruta key={k} id={f.id} text={v.text} />)}
    </StegRam>
  );
}

// ── Markägare & övrigt (nås från sammanställningen) ──────────────────────────────────────────────────────────────────

export function OvrigtBody({ p, onVed }: { p: KlarMedTraktenProps; onVed: () => void }) {
  const o = p.ovrigt;
  return (
    <div data-testid="klar-del3" style={{ background: FARG.upphojt, borderRadius: RADIE.kort, overflow: 'hidden' }}>
      <div data-testid="klar-ovrigt-ved">
        <button type="button" data-testid="klar-ved-rad" onClick={onVed} className="press-row"
          style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block' }}>Ved till markägaren</span>
            {o.ved && <span data-testid="klar-ved-text" style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{o.vedText}</span>}
          </span>
          {/* samma läge-knapp som övriga rader: grå = Nej (standard), vit = Ja (avviker) */}
          <span data-testid="klar-ved-lage" data-avviker={o.ved ? '1' : '0'}
            style={{ boxSizing: 'border-box', minWidth: TRAFFYTA.primar + AVSTAND.l, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: o.ved ? FARG.text : FARG.fyllning, color: o.ved ? FARG.bg : FARG.text2, ...TYP.listtitel }}>
            {o.ved ? 'Ja' : 'Nej'}
          </span>
          <Pil />
        </button>
      </div>
      <OvrigRad id="band-skordare" etikett="Band skördare" varde={o.bandSkordare === true} onVal={(v) => p.onAndra({ bandSkordare: v })}>
        <ParVal id="skordare" vald={o.bandParSkordare} onVal={(v) => p.onAndra({ bandParSkordare: v })} />
      </OvrigRad>
      <OvrigRad id="band-skotare" etikett="Band skotare" varde={o.bandSkotare === true} onVal={(v) => p.onAndra({ bandSkotare: v })}>
        <ParVal id="skotare" vald={o.bandParSkotare} onVal={(v) => p.onAndra({ bandParSkotare: v })} />
      </OvrigRad>
      <OvrigRad id="breddat" etikett="Breddat lastrede" varde={o.breddat} onVal={(v) => p.onAndra({ breddat: v })} />
      {o.visaKonfiguration && (
        <OvrigRad id="konfiguration" etikett="Konfiguration" varde={o.konfiguration === 'smal'} ord={['Smal', 'Bred']} onVal={(v) => p.onAndra({ konfiguration: v ? 'smal' : 'bred' })} />
      )}
      <OvrigRad id="ris" etikett="Ris skotas direkt" varde={o.risDirekt} onVal={(v) => p.onAndra({ risDirekt: v })} under={o.risDirekt ? undefined : 'Nej = riset ligger först'} />
      <OvrigRad id="vagn" etikett="Extra vagn" varde={o.extraVagn} onVal={(v) => p.onAndra({ extraVagn: v })} />
      <OvrigRad id="trailer" etikett="Trailer kan köra in" varde={o.trailerIn} standard onVal={(v) => p.onAndra({ trailerIn: v })}>{null}</OvrigRad>
      {!o.trailerIn && (
        <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>
          <Falt testid="klar-trailer-kommentar" label="Kommentar om trailern" placeholder="Varför inte? T.ex. låg bro" value={o.trailerKommentar} onChange={(v) => p.onAndra({ trailerKommentar: v })} />
        </div>
      )}
      <OvrigRad id="manuell" etikett="Manuell fällning" varde={o.manuellFallning} onVal={(v) => p.onAndra({ manuellFallning: v })}>
        <div style={{ paddingBottom: AVSTAND.s }}>
          <Falt testid="klar-manuell-text" label="Var och varför" placeholder="Var och varför" value={o.manuellFallningText} onChange={(v) => p.onAndra({ manuellFallningText: v })} />
        </div>
      </OvrigRad>
      {p.gamlaAnteckningar.trim() && (
        <div data-testid="klar-gamla-anteckningar" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: `1px solid ${FARG.linje}` }}>
          <div style={{ ...TYP.meta, color: FARG.text3 }}>Gamla anteckningar</div>
          <div style={{ ...TYP.text, color: FARG.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.gamlaAnteckningar.trim()}</div>
        </div>
      )}
    </div>
  );
}
