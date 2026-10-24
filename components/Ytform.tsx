'use client';

// YTFORMEN som affärsuppföljningens vyer delar (översikt, månad, räkna, kvalitet, objektet, medelstam, stämpling, rotkap).
//
// Sedan 2026-10-23 i SAMMA design som resten av appen (arbetsrapporten är förebilden): svart bakgrund, appens typsnitt,
// rundade kort med rader, gråa versala etiketter ovanför korten, värdena ur lib/design/tokens. Före: egen serif-siffra i
// 48 px, egen gråskala, rader utan kort — det såg ut som en annan app. Formen är densamma, bara klädd i appens byggstenar:
//   1. rubrikrad: stor rubrik med väljare ("2026 ⌄"), eller en blå tillbakarad ("‹ Ulfsnäs AU")
//   2. talet i ett kort (TYP.tal) med en rad under som säger vad det är
//   3. tillstånd, dämpad rad, kontroll ("barr ⌄") i samma kort
//   4. raderna i ett kort, med en etikett ovanför (`rubrik`)
// Färg betyder något: orange = något fattas, grönt = når målet, blått = går att navigera. Inget annat är färgat.
//
// Exporterna (TEXT, DAMPAD, GUL …) finns kvar med samma namn så vyerna inte behöver skrivas om, men pekar nu på appens färger.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AVSTAND, FARG, FONT, IKON, KNAPP, KOLUMN, KORT, RADIE, TNUM, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';

export const TEXT = FARG.text;
export const SEKUNDAR = FARG.text3;
export const DAMPAD = FARG.text2;
/** "Något fattas" — appens orange. */
export const GUL = FARG.orange;
/** "Når målet" — appens gröna. */
export const GRON = FARG.gron;
/** Bara "navigerar eller avbryter". */
export const BLA = FARG.bla;
export const LINJE = `1px solid ${FARG.linje}`;
/** Tal i löptext: appens typsnitt, fasta siffrbredder. (Förr egen serif.) */
export const TAL = { fontFamily: 'inherit', ...TNUM } as const;
export const MUTED = { color: FARG.text2, ...TYP.meta } as const;
/** Innehållets maxbredd — appens kolumn (KOLUMN.smal), samma som arbetsrapporten. */
export const BREDD = KOLUMN.smal;
/** Flikradens höjd längst ner (AffarBottomNav) — ett layoutmått, inte ett avstånd. */
const BOTTENRAD = 84;
/** Sidans ruta. Bakgrunden går över hela fönstret, innehållet är en centrerad kolumn på högst BREDD px. Under BREDD
 *  (telefon) är paddingen noll och elementen bär sin egen marginal på 16. Toppfältet reserverar layouten själv. */
export const SIDA = {
  background: FARG.bg, minHeight: '100vh', color: FARG.text, fontFamily: FONT, WebkitFontSmoothing: 'antialiased',
  paddingTop: AVSTAND.s, paddingBottom: medSafeBotten(BOTTENRAD + AVSTAND.xl),
  paddingLeft: `max(0px, calc((100% - ${BREDD}px) / 2))`, paddingRight: `max(0px, calc((100% - ${BREDD}px) / 2))`,
  boxSizing: 'border-box',
} as const;
/** Sidmarginalen inuti kolumnen. */
const SM = AVSTAND.sidmarginal;
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

/** EN pil för alla väljare: appens ikon (expand_more). `storlek` i px. */
export function Pil({ storlek = IKON.text }: { storlek?: number; vanster?: number }) {
  return <Ikon namn="expand_more" storlek={storlek} farg={FARG.text2} />;
}

/** Etikett ovanför ett kort (TYP.micro, versaler) — som "SUMMERING" i arbetsrapporten. */
export function Etikett({ children }: { children: ReactNode }) {
  return <h3 style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.xl}px ${SM + AVSTAND.xs}px ${AVSTAND.s}px` }}>{children}</h3>;
}

/** 1. Rubrikrad: vyns stora rubrik (TYP.titel), med osynlig plockare ovanpå. */
export function Rubrikrad({ text, value, onChange, label, children, hoger }: {
  text: string; value: string; onChange: (v: string) => void; label: string; children: ReactNode; hoger?: ReactNode;
}) {
  return (
    <div style={{ margin: `${AVSTAND.s}px ${SM}px 0`, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, minWidth: 0 }}>
        <h1 style={{ margin: 0, ...TYP.titel, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</h1>
        <Pil storlek={IKON.rad} />
        <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={OVERLAY}>{children}</select>
      </span>
      {hoger}
    </div>
  );
}

/** En stor rubrik utan väljare (TYP.titel) — "Räkna", "Kvalitet". */
export function Rubrik({ children }: { children: ReactNode }) {
  return <h1 style={{ margin: `${AVSTAND.s}px ${SM}px 0`, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', ...TYP.titel }}>{children}</h1>;
}

/** 1. Tillbakarad: blå (den navigerar), med var man hamnar. */
export function Tillbakarad({ href, text }: { href: string; text: string }) {
  return (
    <div style={{ margin: `${AVSTAND.xs}px ${SM - AVSTAND.xs}px 0`, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }}>
      <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', minHeight: TRAFFYTA.min, ...TYP.text, color: FARG.bla,
                                 textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
        <Ikon namn="chevron_left" storlek={IKON.rad} farg="inherit" />{text}
      </Link>
    </div>
  );
}

/** 2 + 3. Talet i ett kort, med raden som säger vad det är. Tillstånd, dämpad rad och kontroll som children (i samma kort). */
export function Stort({ tal, enhet, ordrad, children }: { tal: string; enhet?: string; ordrad: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ ...KORT, margin: `${AVSTAND.m}px ${SM}px 0` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
        <span style={{ ...TYP.tal }}>{tal}</span>
        {enhet && <span style={{ ...TYP.meta, color: FARG.text2 }}>{enhet}</span>}
      </div>
      <div style={{ marginTop: AVSTAND.xs, ...TYP.meta, color: FARG.text2 }}>{ordrad}</div>
      {children}
    </div>
  );
}

/** En rad i talets kort som bär ett tillstånd — färgen förstärker ordet, aldrig ensam. */
export function Tillstand({ farg, children }: { farg: string; children: ReactNode }) {
  return <div style={{ marginTop: AVSTAND.xs, ...TYP.meta, color: farg }}>{children}</div>;
}

/** Dämpad rad: storleken (volym, antal). */
export function Damp({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: AVSTAND.xs, ...TYP.meta, color: FARG.text2 }}>{children}</div>;
}

/** Kontroll som text ("barr ⌄"), med osynlig plockare. */
export function Kontroll({ text, value, onChange, label, children }: {
  text: string; value: string; onChange: (v: string) => void; label: string; children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', marginTop: AVSTAND.xs, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
      <span style={{ ...TYP.meta, color: FARG.text }}>{text}</span>
      <Pil />
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={OVERLAY}>{children}</select>
    </div>
  );
}

/** En förklarande mening. */
export function Mening({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: AVSTAND.s, ...TYP.meta, color: FARG.text2, lineHeight: 1.5 }}>{children}</div>;
}

/** En rad i ett kort. Ett värde: talet längst ut före ›. Två värden: talet intill etiketten, kubiken längst ut.
 *  Stapel under om raden är en del av en fördelning. */
export function Rad({ text, sub, tal, farg, hoger, href, onClick, dampad, stapel, prick, oppen }: {
  text: string; sub?: string; tal?: string; farg?: string; hoger?: string;
  href?: string; onClick?: () => void; dampad?: boolean;
  /** Raden öppnar innehåll under sig: › när stängd, ⌄ när öppen. Utelämnad = en vanlig länkrad (›). */
  oppen?: boolean;
  stapel?: { andel: number; max: number; farg: string };
  /** En färgruta framför etiketten — teckenförklaringen och raden i ett. Färgen bär aldrig ensam: ordet står bredvid. */
  prick?: string;
}) {
  const leder = !!(href || onClick);
  const talStil = { ...TYP.listtitel, ...TNUM, color: farg ?? (dampad ? FARG.text2 : FARG.text) };
  const inre = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.m }}>
        <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
          {prick && <span aria-hidden style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: '50%', background: prick, border: LINJE,
                                              flexShrink: 0, boxSizing: 'border-box' }} />}
          <span style={{ ...TYP.text, color: dampad ? FARG.text2 : FARG.text, whiteSpace: 'nowrap',
                         overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
          {tal != null && hoger != null && <span style={talStil}>{tal}</span>}
        </span>
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          {tal != null && hoger == null && <span style={talStil}>{tal}</span>}
          {hoger != null && <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{hoger}</span>}
          {leder && <Ikon namn={oppen ? 'expand_more' : 'chevron_right'} storlek={IKON.text} farg={FARG.text3} />}
        </span>
      </div>
      {sub && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{sub}</div>}
      {stapel && (
        <div style={{ height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.linje, marginTop: AVSTAND.s }}>
          <div style={{ height: '100%', borderRadius: RADIE.stapel, width: `${Math.max(1, (stapel.andel / Math.max(stapel.max, 1e-9)) * 100)}%`,
                        background: stapel.farg }} />
        </div>
      )}
    </>
  );
  const stil = { display: 'block', width: '100%', borderTop: LINJE, padding: `${AVSTAND.m}px 0`, minHeight: TRAFFYTA.min,
                 textDecoration: 'none', color: FARG.text, textAlign: 'left' as const, fontFamily: 'inherit',
                 background: 'none', cursor: leder ? 'pointer' : 'default', boxSizing: 'border-box' as const };
  if (href) return <Link href={href} style={stil}>{inre}</Link>;
  // Inte `border: 'none'`: i en inline-stil nollar förkortningen den borderTop som redan är satt, och raden tappar sin skiljelinje.
  if (onClick) return <button onClick={onClick} aria-expanded={oppen} style={{ ...stil, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>{inre}</button>;
  return <div style={stil}>{inre}</div>;
}

/** Raderna som ett kort, med etikett ovanför om `rubrik` ges. Första radens linje tas bort — kortets kant är gränsen. */
export function Rader({ children, rubrik }: { children: ReactNode; rubrik?: string }) {
  return (
    <section aria-label={rubrik}>
      {rubrik ? <Etikett>{rubrik}</Etikett> : <div style={{ height: AVSTAND.l }} />}
      <style>{'.yt-rader>:first-child{border-top:none!important}'}</style>
      <div className="yt-rader" style={{ ...KORT, paddingTop: 0, paddingBottom: 0, margin: `0 ${SM}px` }}>{children}</div>
    </section>
  );
}

/** En länk i klartext, efter raderna. Blå: den navigerar. */
export function Textlank({ href, text }: { href: string; text: string }) {
  return (
    <div style={{ margin: `${AVSTAND.s}px ${SM}px 0`, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }}>
      <Link href={href} style={{ ...KNAPP.lank, textDecoration: 'none' }}>{text}<Ikon namn="chevron_right" storlek={IKON.text} farg="inherit" /></Link>
    </div>
  );
}

/** Tekniska detaljer längst ner på djupaste nivån: grått, litet. */
export function Teknisk({ children }: { children: ReactNode }) {
  return <div style={{ margin: `${AVSTAND.l}px ${SM}px 0`, ...TYP.meta, color: FARG.text3, lineHeight: 1.6 }}>{children}</div>;
}

/** Löpande förklaring, en nivå in. */
export function Stycken({ children }: { children: ReactNode }) {
  return <div style={{ ...KORT, margin: `${AVSTAND.m}px ${SM}px 0`, ...TYP.meta, color: FARG.text2, lineHeight: 1.6 }}>{children}</div>;
}

export function Laddar({ vad }: { vad: string }) {
  return <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.xl}px ${SM}px` }}>Hämtar {vad}…</div>;
}

export function Fel({ rubrik, fel, igen }: { rubrik: string; fel: { kod: string; text: string }; igen: () => void }) {
  return (
    <div style={{ ...KORT, margin: `${AVSTAND.l}px ${SM}px 0` }}>
      <div style={{ ...TYP.listtitel, marginBottom: AVSTAND.xs }}>{rubrik}</div>
      {/* Felmeddelandet ska säga vad användaren ska GÖRA. */}
      <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.l }}>
        {fel.kod === 'ABORT' ? 'Anropet avbröts. Tryck Försök igen.'
          : 'Tryck Försök igen. Står felet kvar: logga ut och in, och skicka koden nedan.'}
      </div>
      <button onClick={igen} style={KNAPP.sekundar}>Försök igen</button>
      {/* Detaljen kastas inte bort — utan den går felet inte att felsöka. */}
      <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.l, fontFamily: 'monospace', wordBreak: 'break-word' }}>
        {fel.kod} · {fel.text}
      </div>
    </div>
  );
}
