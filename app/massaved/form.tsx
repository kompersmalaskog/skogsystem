'use client';

// FORMEN som alla massavedsnivåer delar, byggd mot Martins förlagor
// (sex skärmar, 2026-09-07). Samma skärm hela vägen ner:
//   1. rubrikrad med väljare ("Augusti ⌄"), eller tillbakarad med var man
//      är ("‹ Ulfsnäs AU · augusti")
//   2. talet stort, vänsterställt
//   3. ordrad: vad talet betyder
//   4. dämpad rad: storleken (volym, antal)
//   5. kontroll som text där det finns ("barr ⌄", "augusti ⌄")
//   6. en mening när den behövs
//   7. rader med › och ett tal som säger om det är värt att trycka.
//      Har raden två värden står talet intill etiketten och kubiken
//      längst ut — kubiken är sekundär. Har den ett står det längst ut.
//   8. luft under
// Färg betyder något: gult 3 m-stockar, grönt når målet, grått allt annat.
// Länkar är blå. Inget annat är färgat. Tekniska detaljer bor längst ner
// på djupaste nivån, i grått och liten text.

import Link from 'next/link';
import type { ReactNode } from 'react';

export const TEXT = '#e8e8e4';
export const SEKUNDAR = '#7a7a72';
export const DAMPAD = '#9d9d95';
export const GUL = 'rgba(255,179,64,0.95)';
export const GRON = 'rgba(90,255,140,0.9)';
export const BLA = '#5b8fff';
export const LINJE = '1px solid rgba(255,255,255,0.08)';
export const TAL = { fontFamily: "'Fraunces', serif" } as const;
export const MUTED = { color: SEKUNDAR, fontSize: 12 } as const;
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
/** "400763 Akelius Tåget SA -26" → "Akelius Tåget SA", "Ulfsnäs AU 2026" → "Ulfsnäs AU".
 *  Vidas ordernummer först och årtalet sist är inte namnet. */
export const kortObjekt = (namn: string) =>
  namn.replace(/^\d{4,}\s+/, '').replace(/\s+(20\d\d|-\d\d)\s*$/, '').trim();

/** 1. Rubrikrad med osynlig plockare ovanpå texten. */
export function Rubrikrad({ text, value, onChange, label, children }: {
  text: string; value: string; onChange: (v: string) => void; label: string; children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', margin: '10px 16px 0', minHeight: 44, display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      <span style={{ color: DAMPAD, marginLeft: 7, fontSize: 14, flexShrink: 0, lineHeight: 1 }}>⌄</span>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={OVERLAY}>{children}</select>
    </div>
  );
}

/** 1. Tillbakarad: var man är. */
export function Tillbakarad({ href, text }: { href: string; text: string }) {
  return (
    <div style={{ margin: '10px 16px 0', minHeight: 44, display: 'flex', alignItems: 'center' }}>
      <Link href={href} style={{ fontSize: 13, fontWeight: 500, color: DAMPAD, textDecoration: 'none',
                                 whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={{ fontSize: 16, marginRight: 8 }}>‹</span>{text}
      </Link>
    </div>
  );
}

/** 2 + 3. Det stora talet och ordraden. Raderna under som children. */
export function Stort({ tal, enhet, ordrad, children }: { tal: string; enhet?: string; ordrad: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ padding: '10px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ ...TAL, fontSize: 48, lineHeight: 1.05, fontWeight: 500 }}>{tal}</span>
        {enhet && <span style={{ ...TAL, fontSize: 18, color: DAMPAD }}>{enhet}</span>}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>{ordrad}</div>
      {children}
    </div>
  );
}

/** Raden direkt under ordraden som bär ett tillstånd — färgen förstärker ordet. */
export function Tillstand({ farg, children }: { farg: string; children: ReactNode }) {
  return <div style={{ marginTop: 2, fontSize: 13, lineHeight: 1.5, color: farg }}>{children}</div>;
}

/** 4. Dämpad rad: storleken. */
export function Damp({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 2, fontSize: 12, color: DAMPAD, lineHeight: 1.5 }}>{children}</div>;
}

/** 5. Kontrollrad som text, med osynlig plockare. */
export function Kontroll({ text, value, onChange, label, children }: {
  text: string; value: string; onChange: (v: string) => void; label: string; children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', marginTop: 6, minHeight: 40, display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: DAMPAD }}>{text}</span>
      <span style={{ color: DAMPAD, marginLeft: 6, fontSize: 13, lineHeight: 1 }}>⌄</span>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={OVERLAY}>{children}</select>
    </div>
  );
}

/** 6. En förklarande mening. */
export function Mening({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 10, fontSize: 12, color: DAMPAD, lineHeight: 1.55 }}>{children}</div>;
}

/** 7. En rad. Ett värde: talet längst ut före ›. Två värden: talet intill
 *  etiketten, kubiken längst ut. Stapel under om raden är en del av en fördelning. */
export function Rad({ text, tal, farg, hoger, href, onClick, dampad, stapel }: {
  text: string; tal?: string; farg?: string; hoger?: string;
  href?: string; onClick?: () => void; dampad?: boolean;
  stapel?: { andel: number; max: number; farg: string };
}) {
  const leder = !!(href || onClick);
  const talStil = { fontSize: 13, fontWeight: 600, color: farg ?? (dampad ? DAMPAD : TEXT) };
  const inre = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: dampad ? DAMPAD : TEXT, whiteSpace: 'nowrap',
                         overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
          {tal != null && hoger != null && <span style={talStil}>{tal}</span>}
        </span>
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          {tal != null && hoger == null && <span style={talStil}>{tal}</span>}
          {hoger != null && <span style={{ fontSize: 12, color: DAMPAD }}>{hoger}</span>}
          {leder && <span style={{ color: DAMPAD, fontSize: 15, lineHeight: 1 }}>›</span>}
        </span>
      </div>
      {stapel && (
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginTop: 7 }}>
          <div style={{ height: '100%', borderRadius: 2, width: `${Math.max(1, (stapel.andel / Math.max(stapel.max, 1e-9)) * 100)}%`,
                        background: stapel.farg }} />
        </div>
      )}
    </>
  );
  const stil = { display: 'block', width: '100%', borderTop: LINJE, padding: stapel ? '10px 0 12px' : '10px 0', minHeight: 40,
                 textDecoration: 'none', color: TEXT, textAlign: 'left' as const, fontFamily: 'inherit',
                 background: 'none', cursor: leder ? 'pointer' : 'default', boxSizing: 'border-box' as const };
  if (href) return <Link href={href} style={stil}>{inre}</Link>;
  if (onClick) return <button onClick={onClick} style={{ ...stil, border: 'none', borderTop: LINJE }}>{inre}</button>;
  return <div style={stil}>{inre}</div>;
}

/** 7. Raderna som grupp, med en avslutande linje. 8. Luften kommer efter. */
export function Rader({ children }: { children: ReactNode }) {
  return (
    <div style={{ margin: '16px 16px 0' }}>
      {children}
      <div style={{ borderTop: LINJE }} />
    </div>
  );
}

/** En länk i klartext, efter raderna. Blå: det är en länk. */
export function Textlank({ href, text }: { href: string; text: string }) {
  return (
    <div style={{ margin: '14px 16px 0', minHeight: 40, display: 'flex', alignItems: 'center' }}>
      <Link href={href} style={{ fontSize: 13, color: BLA, textDecoration: 'none' }}>{text} <span style={{ marginLeft: 4 }}>›</span></Link>
    </div>
  );
}

/** Tekniska detaljer längst ner på djupaste nivån: grått, litet. */
export function Teknisk({ children }: { children: ReactNode }) {
  return <div style={{ margin: '18px 16px 0', fontSize: 11, color: SEKUNDAR, lineHeight: 1.6 }}>{children}</div>;
}

/** Löpande förklaring, en nivå in. */
export function Stycken({ children }: { children: ReactNode }) {
  return <div style={{ padding: '12px 16px 0', fontSize: 12, color: DAMPAD, lineHeight: 1.65 }}>{children}</div>;
}

export function Laddar({ vad }: { vad: string }) {
  return <div style={{ ...MUTED, padding: '24px 16px' }}>Hämtar {vad}…</div>;
}

export function Fel({ rubrik, fel, igen }: { rubrik: string; fel: { kod: string; text: string }; igen: () => void }) {
  return (
    <div style={{ padding: '24px 16px', lineHeight: 1.6 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{rubrik}</div>
      {/* Felmeddelandet ska säga vad användaren ska GÖRA. */}
      <div style={{ fontSize: 12, color: DAMPAD, marginBottom: 14 }}>
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
