'use client';

// FORMEN som alla massavedsnivåer delar. Samma skärm hela vägen ner:
//   1. rubrikrad med väljare, eller tillbakarad med var man är
//   2. ett stort tal, vänsterställt
//   3. ordrad: vad talet betyder
//   4. dämpad rad: storleken
//   5. kontrollrad som text där det finns
//   6. en förklarande mening när den behövs
//   7. rader med › och ett tal där talet avgör om man vill trycka
//   8. luft under
// Trycker man in ska nästa skärm se likadan ut — inte bli en lista med
// staplar och fotnoter.

import Link from 'next/link';
import type { ReactNode } from 'react';

export const TEXT = '#e8e8e4';
export const SEKUNDAR = '#7a7a72';
export const GUL = 'rgba(255,179,64,0.95)';
export const GRON = 'rgba(90,255,140,0.9)';
export const LINJE = '1px solid rgba(255,255,255,0.07)';
export const TAL = { fontFamily: "'Fraunces', serif" } as const;
export const MUTED = { color: SEKUNDAR, fontSize: 11 } as const;
export const SIDA = { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90,
                      color: TEXT, fontFamily: "'Geist', system-ui, sans-serif" } as const;
/** Osynlig native-väljare ovanpå en textrad: iOS-plockaren, men raden ser ut som text. */
const OVERLAY = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', opacity: 0,
                  cursor: 'pointer', fontSize: 16 };

export const nf = (n: number, d: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const nf0 = (n: number) => nf(n, 0);
export const nf1 = (n: number) => nf(n, 1);
export const nf2 = (n: number) => nf(n, 2);

export const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni',
                        'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
export const manadNamn = (ym: string) => MANADER[Number(ym.split('-')[1]) - 1];
export const manadEtikett = (ym: string) => `${manadNamn(ym)} ${ym.split('-')[0]}`;
export const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function stegaManad(ym: string, steg: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + steg, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function nuManad() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Maskinen sätter Vidas ordernummer först i namnet. Det är inte namnet. */
export const utanPrefix = (namn: string) => namn.replace(/^\d{4,}\s+/, '');

/** 1. Rubrikrad med osynlig plockare ovanpå texten. */
export function Rubrikrad({ text, value, onChange, label, children }: {
  text: string; value: string; onChange: (v: string) => void; label: string; children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', margin: '14px 16px 0', minHeight: 44, display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      <span style={{ color: SEKUNDAR, marginLeft: 6, fontSize: 13, flexShrink: 0 }}>▾</span>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={OVERLAY}>{children}</select>
    </div>
  );
}

/** 1. Tillbakarad: var man är. */
export function Tillbakarad({ href, text }: { href: string; text: string }) {
  return (
    <div style={{ margin: '14px 16px 0', minHeight: 44, display: 'flex', alignItems: 'center' }}>
      <Link href={href} style={{ fontSize: 15, fontWeight: 600, color: TEXT, textDecoration: 'none',
                                 whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        ‹ {text}
      </Link>
    </div>
  );
}

/** 2 + 3. Det stora talet och ordraden. Raderna under (Vida, kontroll, dämpad, mening) som children. */
export function Stort({ tal, enhet, ordrad, children }: { tal: string; enhet?: string; ordrad: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ padding: '18px 16px 0' }}>
      <div>
        <span style={{ ...TAL, fontSize: 60, lineHeight: 1 }}>{tal}</span>
        {enhet && <span style={{ ...TAL, fontSize: 22, color: SEKUNDAR, marginLeft: 6 }}>{enhet}</span>}
      </div>
      <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>{ordrad}</div>
      {children}
    </div>
  );
}

/** Raden direkt under ordraden som bär ett tillstånd — färgen förstärker ordet, bär det aldrig ensam. */
export function Tillstand({ farg, children }: { farg: string; children: ReactNode }) {
  return <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: farg, fontWeight: 600 }}>{children}</div>;
}

/** 4. Dämpad rad: storleken. */
export function Damp({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 4, fontSize: 13, color: SEKUNDAR, lineHeight: 1.5 }}>{children}</div>;
}

/** 5. Kontrollrad som text, med osynlig plockare. */
export function Kontroll({ text, value, onChange, label, children }: {
  text: string; value: string; onChange: (v: string) => void; label: string; children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', marginTop: 12, minHeight: 44, display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 13 }}>{text}</span>
      <span style={{ color: SEKUNDAR, marginLeft: 6, fontSize: 13 }}>▾</span>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={OVERLAY}>{children}</select>
    </div>
  );
}

/** 6. En förklarande mening. */
export function Mening({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 12, fontSize: 12, color: SEKUNDAR, lineHeight: 1.6 }}>{children}</div>;
}

/** 7. En rad: text till vänster, ett tal till höger, › om den leder någonstans. */
export function Rad({ text, sub, tal, enhet, farg, href, onClick, dampad }: {
  text: string; sub?: ReactNode; tal?: string; enhet?: string; farg?: string;
  href?: string; onClick?: () => void; dampad?: boolean;
}) {
  const leder = !!(href || onClick);
  const inre = (
    <>
      <span style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: dampad ? SEKUNDAR : TEXT }}>{text}</div>
        {sub && <div style={{ ...MUTED, marginTop: 2 }}>{sub}</div>}
      </span>
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {tal != null && (
          <span>
            <span style={{ ...TAL, fontSize: 17, color: farg ?? (dampad ? SEKUNDAR : TEXT) }}>{tal}</span>
            {enhet && <span style={{ ...MUTED, marginLeft: 3 }}>{enhet}</span>}
          </span>
        )}
        {leder && <span style={{ color: SEKUNDAR, fontSize: 16 }}>›</span>}
      </span>
    </>
  );
  const stil = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                 borderTop: LINJE, padding: '12px 0', minHeight: 48, textDecoration: 'none', color: TEXT,
                 textAlign: 'left' as const, fontFamily: 'inherit', background: 'none', cursor: leder ? 'pointer' : 'default' };
  if (href) return <Link href={href} style={stil}>{inre}</Link>;
  if (onClick) return <button onClick={onClick} style={{ ...stil, border: 'none', borderTop: LINJE }}>{inre}</button>;
  return <div style={stil}>{inre}</div>;
}

/** 7. Raderna som grupp, med en avslutande linje. 8. Luften kommer efter. */
export function Rader({ children }: { children: ReactNode }) {
  return (
    <div style={{ margin: '18px 16px 0' }}>
      {children}
      <div style={{ borderTop: LINJE }} />
    </div>
  );
}

/** En länk i klartext, efter raderna. */
export function Textlank({ href, text }: { href: string; text: string }) {
  return (
    <div style={{ margin: '16px 16px 0' }}>
      <Link href={href} style={{ fontSize: 13, color: TEXT, textDecoration: 'none' }}>{text} <span style={{ color: SEKUNDAR }}>›</span></Link>
    </div>
  );
}

/** Löpande förklaring, en nivå in. */
export function Stycken({ children }: { children: ReactNode }) {
  return <div style={{ padding: '14px 16px 0', fontSize: 12, color: SEKUNDAR, lineHeight: 1.65 }}>{children}</div>;
}

export function Laddar({ vad }: { vad: string }) {
  return <div style={{ ...MUTED, fontSize: 12, padding: '24px 16px' }}>Hämtar {vad}…</div>;
}

export function Fel({ rubrik, fel, igen }: { rubrik: string; fel: { kod: string; text: string }; igen: () => void }) {
  return (
    <div style={{ padding: '24px 16px', lineHeight: 1.6 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{rubrik}</div>
      {/* Felmeddelandet ska säga vad användaren ska GÖRA. */}
      <div style={{ fontSize: 12, color: SEKUNDAR, marginBottom: 14 }}>
        {fel.kod === 'ABORT' ? 'Anropet avbröts. Tryck Försök igen.'
          : 'Tryck Försök igen. Står felet kvar: logga ut och in, och skicka koden nedan.'}
      </div>
      <button onClick={igen}
        style={{ border: 'none', borderRadius: 8, padding: '12px 22px', minHeight: 44, fontFamily: 'inherit',
                 fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(90,255,140,0.15)', color: GRON }}>
        Försök igen
      </button>
      {/* Detaljen kastas inte bort — utan den går felet inte att felsöka. */}
      <div style={{ ...MUTED, marginTop: 16, fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-word' }}>
        {fel.kod} · {fel.text}
      </div>
    </div>
  );
}
