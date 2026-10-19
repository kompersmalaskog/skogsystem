'use client';

// Byggstenarna för utbildningsvyerna. Allt mått-, färg- och typvärde kommer ur
// lib/design/tokens — den här filen innehåller inga egna literaler.
//
// Formen är "svaret först": varje sida inleds med ETT tal som besvarar sidans
// fråga, under det bara det som kräver något, och det som är i ordning ligger
// bakom en dämpad rad som fälls ut på plats.

import React, { useState } from 'react';
import Link from 'next/link';
import Ikon from '@/components/design/Ikon';
import {
  AVSTAND, FARG, FONT, IKON, INAKTIV, KNAPP, KORT, RADIE, RORELSE,
  ROT_MIN_HOJD, TRAFFYTA, TYP, VIKT, designCss, KOLUMN_CSS, kolumnRot,
} from '@/lib/design/tokens';
import { KRAVTYP_META, visaNamn, type Kravtyp, type Medarbetare } from '@/lib/utbildning';

/** Plats för bottennavigationen, så inget hamnar under den. */
const BOTTEN_LUFT = AVSTAND.xxl * 4;

// ---- Vyns rot: svart, en kolumn, sidmarginal, rörelse-CSS ----
export function Vy({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: ROT_MIN_HOJD,
        ...kolumnRot(),
        background: FARG.bg,
        color: FARG.text,
        fontFamily: FONT,
        WebkitFontSmoothing: 'antialiased',
        padding: `${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${BOTTEN_LUFT}px`,
        boxSizing: 'border-box',
      }}
    >
      <style>{designCss}{KOLUMN_CSS}</style>
      {children}
    </div>
  );
}

// ---- Toppraden: tillbaka till vänster, en åtgärd till höger ----
export function Topprad({ bak, atgard }: { bak?: { href: string; label: string }; atgard?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
      {bak ? (
        <Link
          href={bak.href}
          style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, color: FARG.bla, textDecoration: 'none', ...TYP.text, marginLeft: -AVSTAND.s }}
        >
          <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />
          {bak.label}
        </Link>
      ) : (
        <span />
      )}
      {atgard ?? <span />}
    </div>
  );
}

/** Vyns namn — litet. Talet under är huvudsaken, inte rubriken. */
export function Etikett({ children }: { children: React.ReactNode }) {
  return <h1 style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.m}px 0 0` }}>{children}</h1>;
}

/** ETT tal per vy (skillen: "ett tal per vy är huvudsaken"). */
export function Tal({ tal, under }: { tal: string; under: string }) {
  return (
    <div style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
      <div style={{ ...TYP.tal, color: FARG.text }}>{tal}</div>
      <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{under}</div>
    </div>
  );
}

/** Grön bekräftelse när inget kräver något — vyn är aldrig tom. */
export function KlartKort({ rubrik, rad }: { rubrik: string; rad?: string }) {
  return (
    <div style={{ ...KORT, display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginBottom: AVSTAND.rad }}>
      <Ikon namn="check_circle" storlek={IKON.rad} farg={FARG.gron} fylld />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: FARG.text }}>{rubrik}</div>
        {rad && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{rad}</div>}
      </div>
    </div>
  );
}

// ---- Kort och rader ----

export function Kort({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, overflow: 'hidden', marginBottom: AVSTAND.rad, ...style }}>
      {children}
    </div>
  );
}

type RadProps = {
  titel: React.ReactNode;
  under?: React.ReactNode;
  /** Prickens färg — alltid tillsammans med en text som säger samma sak. */
  prick?: string;
  varde?: React.ReactNode;
  vardeFarg?: string;
  href?: string;
  onClick?: () => void;
  /** Sista raden i kortet ritar ingen linje under sig. */
  sista?: boolean;
  dampad?: boolean;
  pil?: 'hoger' | 'upp' | 'ned' | 'ingen';
};

export function Rad({ titel, under, prick, varde, vardeFarg, href, onClick, sista, dampad, pil }: RadProps) {
  const klickbar = !!(href || onClick);
  const pilen = pil ?? (klickbar ? 'hoger' : 'ingen');

  const innehall = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: AVSTAND.inuti,
        minHeight: TRAFFYTA.min,
        padding: `${AVSTAND.m}px 0`,
        borderBottom: sista ? 'none' : `1px solid ${FARG.linje}`,
      }}
    >
      {prick && (
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: RADIE.cirkel, background: prick, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: dampad ? FARG.text2 : FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titel}
        </div>
        {under != null && under !== '' && (
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{under}</div>
        )}
      </div>
      {varde != null && varde !== '' && (
        <span style={{ ...TYP.meta, color: vardeFarg ?? FARG.text2, flexShrink: 0, textAlign: 'right' }}>{varde}</span>
      )}
      {pilen !== 'ingen' && (
        <Ikon
          namn={pilen === 'hoger' ? 'chevron_right' : pilen === 'upp' ? 'expand_less' : 'expand_more'}
          storlek={IKON.text}
          farg={FARG.text3}
        />
      )}
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{innehall}</Link>;
  }
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        style={{ cursor: 'pointer' }}
      >
        {innehall}
      </div>
    );
  }
  return innehall;
}

/** Det som är i ordning: en dämpad rad som fäller ut raderna UNDER sig, i samma
 *  kort. Ingen ny sida — man trycker igen och det viks ihop. */
export function FallUt({ etikett, antal, children }: { etikett: string; antal: number; children: React.ReactNode }) {
  const [oppen, setOppen] = useState(false);
  if (antal === 0) return null;
  return (
    <Kort>
      <Rad titel={etikett} dampad sista={!oppen} pil={oppen ? 'upp' : 'ned'} onClick={() => setOppen((v) => !v)} />
      {oppen && <div className="tona-in" style={{ transition: `opacity ${RORELSE.byte}ms ${RORELSE.kurva}` }}>{children}</div>}
    </Kort>
  );
}

// ---- Tillstånd: laddar / fel / tomt (skiljs alltid åt) ----

export function LoadingView({ text = 'Hämtar utbildningarna…' }: { text?: string }) {
  return <p style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', marginTop: AVSTAND.xxl }}>{text}</p>;
}

export function ErrorView({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div style={{ ...KORT, marginTop: AVSTAND.l }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, color: FARG.rod, ...TYP.listtitel }}>
        <Ikon namn="error" storlek={IKON.rad} farg={FARG.rod} />
        Kunde inte hämta utbildningarna
      </div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s, wordBreak: 'break-word' }}>{error}</div>
      {onRetry && (
        <button onClick={onRetry} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.l }}>Försök igen</button>
      )}
    </div>
  );
}

export function EmptyView({ text }: { text: string }) {
  return <p style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', marginTop: AVSTAND.xxl }}>{text}</p>;
}

// ---- Kravtyp-etikett ----
export function KravtypBadge({ kravtyp }: { kravtyp: Kravtyp }) {
  return (
    <span
      style={{
        ...TYP.micro,
        color: FARG.text2,
        background: FARG.upphojt,
        padding: `${AVSTAND.xs}px ${AVSTAND.s}px`,
        borderRadius: RADIE.rad,
        whiteSpace: 'nowrap',
      }}
    >
      {KRAVTYP_META[kravtyp].label}
    </span>
  );
}

// ---- Formulär-primitiver ----
export const inputStyle: React.CSSProperties = {
  background: FARG.fyllning,
  borderRadius: RADIE.rad,
  border: 'none',
  color: FARG.text,
  padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
  ...TYP.text,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  minHeight: TRAFFYTA.min,
  boxSizing: 'border-box',
  colorScheme: 'dark',
};

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ ...TYP.micro, color: FARG.text2, display: 'block', margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
      {children}
    </label>
  );
}

export function SegmentedControl<V extends string>({
  options, value, onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div role="tablist" style={{ display: 'flex', background: FARG.linje, borderRadius: RADIE.rad, padding: AVSTAND.xs }}>
      {options.map((o) => {
        const vald = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={vald}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: TRAFFYTA.min,
              padding: `0 ${AVSTAND.s}px`,
              borderRadius: RADIE.rad,
              border: 'none',
              ...TYP.meta,
              fontWeight: vald ? VIKT.halvfet : VIKT.normal,
              fontFamily: 'inherit',
              cursor: 'pointer',
              background: vald ? FARG.fyllning : 'transparent',
              color: vald ? FARG.text : FARG.text2,
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 51,
        height: 31,
        borderRadius: RADIE.sheet,
        border: 'none',
        background: checked ? FARG.gron : FARG.fyllning,
        position: 'relative',
        cursor: 'pointer',
        transition: `background ${RORELSE.tryck}ms ${RORELSE.kurva}`,
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 27,
          height: 27,
          borderRadius: RADIE.cirkel,
          background: FARG.text,
          transition: `left ${RORELSE.tryck}ms ${RORELSE.kurva}`,
        }}
      />
    </button>
  );
}

// Fler personer kryssas i på en gång (registrera bevis / kravlista).
export function PersonChecklist({
  medarbetare, valda, onToggle,
}: {
  medarbetare: Medarbetare[];
  valda: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <Kort style={{ marginBottom: 0 }}>
      {medarbetare.map((m, i) => (
        <Rad
          key={m.id}
          titel={visaNamn(m.namn)}
          sista={i === medarbetare.length - 1}
          pil="ingen"
          onClick={() => onToggle(m.id)}
          varde={valda.has(m.id) ? <Ikon namn="check" storlek={IKON.rad} farg={FARG.bla} /> : undefined}
        />
      ))}
    </Kort>
  );
}

/** Skärmens EN primära handling: fylld vit på svart, 48 px.
 *  Blått är bara navigation — en knapp som skapar data är aldrig blå. */
export function PrimaryButton({
  children, onClick, disabled, destruktiv,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destruktiv?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...KNAPP.primar,
        ...(destruktiv ? { background: FARG.rod, color: FARG.text } : null),
        ...(disabled ? INAKTIV : null),
      }}
    >
      {children}
    </button>
  );
}
