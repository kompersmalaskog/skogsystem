'use client';

// Ekonomisektionens delade designmall — EN plats för sidram, periodväxlare,
// hero, metarad, listor och statuslägen. Vyerna (Översikt, Per klass,
// Mot ackord — Resultat/Inställningar i senare steg) får inte definiera
// egna varianter av det som finns här: två varianter driftar alltid isär.
//
// Designspråket:
// - Mobilproportion även på desktop: maxbredd 400px, centrerad.
// - Bärnsten är sektionens ENDA meningsbärande färg på översiktsnivå
//   (= preliminärt/ej spikat). Grönt/rött bara för signerade tal.
// - Rader är EN yta med 0.5px-avdelare — inte kort-i-kort. Ett Fraunces-tal
//   per rad; enheten skrivs EN gång i EnhetsFot, inte på varje rad.

import Link from 'next/link';
import EkonomiBottomNav from '../EkonomiBottomNav';
import { type PeriodType, getPeriodLabel } from '@/lib/ekonomi/period';

export const BARNSTEN = '240,178,76';
export const GRON = '90,255,140';
export const ROD = '255,90,90';
export const MAXBREDD = 400;

const HAIRLINE = '0.5px solid rgba(255,255,255,0.07)';

// ── Sidram ──────────────────────────────────────────────────────────────

export function EkonomiSida({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#111110', minHeight: '100vh', paddingTop: 24, paddingBottom: 120, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" }}>
      {/* Fraunces för hero/tal — laddas här, en gång för hela sektionen */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&display=swap" />
      <div style={{ maxWidth: MAXBREDD, margin: '0 auto' }}>
        {children}
      </div>
      <EkonomiBottomNav />
    </div>
  );
}

// ── Periodväxlare ───────────────────────────────────────────────────────
// Avskalad: bara text, aktiv period understruken. Ingen ruta, ingen bakgrund.

const PERIOD_NAMN: Record<PeriodType, string> = { D: 'Dag', V: 'Vecka', M: 'Månad', K: 'Kvartal', A: 'År' };

export function Periodvaxlare({ perioder, period, offset, onPeriod, onOffset, onInfo }: {
  perioder: PeriodType[];
  period: PeriodType;
  offset: number;
  onPeriod: (p: PeriodType) => void;
  onOffset: (nyOffset: number) => void;
  onInfo?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 14 }}>
      {perioder.map(p => {
        const aktiv = p === period;
        return (
          <button key={p} onClick={() => onPeriod(p)} style={{
            border: 'none', background: 'none', padding: '4px 0 3px',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            color: aktiv ? '#e8e8e4' : '#7a7a72',
            borderBottom: aktiv ? '1.5px solid #e8e8e4' : '1.5px solid transparent',
          }}>{PERIOD_NAMN[p]}</button>
        );
      })}
      <div style={{ flex: 1 }} />
      <button aria-label="Föregående period" onClick={() => onOffset(offset - 1)}
        style={{ border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 6px' }}>&#8249;</button>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 96, textAlign: 'center' }}>
        {getPeriodLabel(period, offset)}
      </span>
      <button aria-label="Nästa period" onClick={() => onOffset(offset + 1)}
        style={{ border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 6px' }}>&#8250;</button>
      {onInfo && (
        <button aria-label="Om beräkningen" onClick={onInfo} style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(255,255,255,0.08)', border: 'none', color: '#7a7a72',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          fontStyle: 'italic', lineHeight: 1,
        }}>i</button>
      )}
    </div>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────
// Ett lugnt centrerat Fraunces-tal. Benvitt för magnituder ("vi körde in"),
// grönt/rött BARA när värdet är ett signerat tal (± mot timpeng).

export function Hero({ etikett, varde, vardeFarg = '#e8e8e4', storlek = 44, under }: {
  etikett: string;
  varde: string;
  vardeFarg?: string;
  storlek?: number;
  under?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 16px 8px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: '#7a7a72' }}>{etikett}</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: storlek, lineHeight: 1.1, fontWeight: 500, color: vardeFarg, marginTop: 10, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
        {varde}
      </div>
      {under}
    </div>
  );
}

// ── Metarad ─────────────────────────────────────────────────────────────
// Diskret centrerad rad under hero — INGEN färgad pill. Segment separeras
// med "·"; bärnsten-segment (preliminärt) i bärnsten, resten dämpat.

export type MetaDel = { text: string; barnsten?: boolean };

export function MetaRad({ delar }: { delar: (MetaDel | null | false | undefined)[] }) {
  const synliga = delar.filter(Boolean) as MetaDel[];
  if (synliga.length === 0) return null;
  return (
    <div style={{ textAlign: 'center', fontSize: 12, color: '#7a7a72', marginTop: 14, padding: '0 16px', lineHeight: 1.6 }}>
      {synliga.map((d, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <span style={d.barnsten ? { color: `rgba(${BARNSTEN},0.85)` } : undefined}>{d.text}</span>
        </span>
      ))}
    </div>
  );
}

// ── Lista & rader ───────────────────────────────────────────────────────

export function SektionsTitel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 32, padding: '0 4px' }}>
      {children}
    </div>
  );
}

export function Lista({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#1a1a18', borderRadius: 14, padding: '0 16px', ...style }}>
      {children}
    </div>
  );
}

// EN historia per rad: namn + dämpad detaljrad till vänster, ETT Fraunces-tal
// till höger. Stapel (andel 0–1) ritas på RADENS fulla bredd — jämförbar
// mellan rader. `children` är uppfällt innehåll (renderas när `oppen`).
export function ListRad({ rubrik, rubrikFarg = '#e8e8e4', detalj, tal, talFarg = '#e8e8e4', undertal, stapelAndel, chevron, oppen, onClick, sista, children }: {
  rubrik: React.ReactNode;
  rubrikFarg?: string;
  detalj?: React.ReactNode;
  tal?: React.ReactNode;
  talFarg?: string;
  undertal?: React.ReactNode;
  stapelAndel?: number | null;
  chevron?: boolean;
  oppen?: boolean;
  onClick?: () => void;
  sista?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: '16px 0', borderBottom: sista ? 'none' : HAIRLINE }}>
      <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: rubrikFarg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rubrik}
            </div>
            {detalj != null && <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 4 }}>{detalj}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {tal != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: talFarg, fontVariantNumeric: 'tabular-nums' }}>
                  {tal}
                </div>
                {undertal != null && <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>{undertal}</div>}
              </div>
            )}
            {chevron && (
              <span style={{ fontSize: 11, color: '#7a7a72', transform: oppen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
            )}
          </div>
        </div>
        {stapelAndel != null && (
          <div style={{ marginTop: 8, height: 3, borderRadius: 2, width: `${Math.max(0, Math.min(1, stapelAndel)) * 100}%`, background: 'rgba(122,122,114,0.5)' }} />
        )}
      </div>
      {oppen && children != null && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: HAIRLINE, display: 'grid', gap: 6 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Enheten skrivs EN gång under listan — inte på varje rad.
export function EnhetsFot({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#7a7a72', textAlign: 'center', marginTop: 10, padding: '0 16px' }}>
      {children}
    </div>
  );
}

// ── Statuslägen — laddar / fel / ärligt tomt ────────────────────────────

export function Laddar() {
  return <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>;
}

export function FelRuta({ titel, fel, onRetry }: { titel: string; fel: string; onRetry: () => void }) {
  return (
    <div style={{ margin: 16, padding: 14, background: `rgba(${ROD},0.08)`, border: `1px solid rgba(${ROD},0.3)`, color: 'rgba(255,160,160,0.95)', borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{titel}</div>
      <div>{fel}</div>
      <button onClick={onRetry} style={{ marginTop: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#e8e8e4', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
        Försök igen
      </button>
    </div>
  );
}

export function Tomt({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 16px 8px' }}>
      <div style={{ fontSize: 13, color: '#7a7a72' }}>{children}</div>
    </div>
  );
}
