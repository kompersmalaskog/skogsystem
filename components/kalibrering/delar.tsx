'use client';
// Delade delar i kalibreringsvyn — allt på tokens (lib/design/tokens) och byggstenar (components/design).
//
// FÄRGREGLER (beslut 2026-10): blått bara för navigera/avbryt. En STATUS visas bara som en prick eller en etikett bredvid ett ord
// (`Prick`/`Status`), aldrig som färgad text. Diagrammens avvikelsefärger behåller sin betydelse (grå = i tolerans, orange = över,
// röd = långt över, blå = för litet) men tar sina värden ur FARG — se TON_FARG.
import type { CSSProperties, ReactNode } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import type { ToneToken } from '@/lib/kalibrering/bedomning';

/** Avvikelseskalan i diagram och prickar. ok är grå (tyst), cold = för litet, hi = över, hot = långt över. */
export const TON_FARG: Record<ToneToken, string> = { ok: FARG.text2, cold: FARG.bla, hi: FARG.orange, hot: FARG.rod };

/** Ordet som står bredvid pricken när en profilbedömning inte är ok (hi = godkänt men under målet, hot = under golvet). */
export const PROFIL_ORD: Record<ToneToken, string | null> = { ok: null, cold: null, hi: 'under målet', hot: 'under kravet' };

/** En status-prick (8 px). Står alltid bredvid ett ord. */
export function Prick({ ton, farg }: { ton?: ToneToken; farg?: string }) {
  return (
    <span aria-hidden="true"
      style={{ display: 'inline-block', flexShrink: 0, width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: farg ?? TON_FARG[ton ?? 'ok'] }} />
  );
}

/** Prick + ord. Färgen förstärker bara ordet. */
export function Status({ ton, ord, farg, ljus }: { ton?: ToneToken; ord: ReactNode; farg?: string; /** ordet i huvudtextfärg i stället för dämpad */ ljus?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: ljus ? FARG.text : FARG.text2 }}>
      <Prick ton={ton} farg={farg} />
      <span>{ord}</span>
    </span>
  );
}

/** En lugn rad: ikon + dämpad text (tomt, laddar, "inget att åtgärda"). */
export function Lugn({ ikon = 'info', children, marginTop = AVSTAND.l }: { ikon?: string; children: ReactNode; marginTop?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginTop, ...TYP.meta, color: FARG.text2 }}>
      <Ikon namn={ikon} storlek={IKON.text} />
      <span>{children}</span>
    </div>
  );
}

/** Fri yta inne i ett kort (Sektion-kortet har ingen egen topp-/bottenpadding — raderna bär den). */
export function Fyll({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ padding: `${AVSTAND.m}px 0`, ...style }}>{children}</div>;
}

/** En dämpad förklarande rad (meta, text2). */
export function Meta({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...TYP.meta, color: FARG.text2, ...style }}>{children}</div>;
}

/** Ett mätvärde som tal (TYP.tal) i en tonad ruta: etikett under, valfri förklaring, status som prick + ord. Ok är dämpat. */
export function Metrik({ varde, etikett, hint, ton }: { varde: string; etikett: ReactNode; hint?: ReactNode; ton: ToneToken }) {
  const ord = PROFIL_ORD[ton];
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: `${AVSTAND.l}px ${AVSTAND.s}px`, background: FARG.tonad, borderRadius: RADIE.kort }}>
      <div style={{ ...TYP.tal, color: ton === 'ok' ? FARG.text2 : FARG.text }}>{varde}</div>
      {ord && <div style={{ display: 'flex', justifyContent: 'center', marginTop: AVSTAND.xs }}><Status ton={ton} ord={ord} /></div>}
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{etikett}</div>
      {hint != null && hint !== '' && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{hint}</div>}
    </div>
  );
}

/** "‹ <rubrik>" — ett steg tillbaka (blått: navigerar). */
export function Tillbaka({ etikett, onTryck }: { etikett: string; onTryck: () => void }) {
  return (
    <button type="button" onClick={onTryck} style={{ ...KNAPP.lank, marginBottom: AVSTAND.xs }}>
      <Ikon namn="chevron_left" storlek={IKON.rad} farg="inherit" />
      <span>{etikett}</span>
    </button>
  );
}

/** Ett läs-fält-lik knapp som öppnar ett ark (maskinfiltret). */
export const FALT_KNAPP: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`,
  background: FARG.kort, border: 'none', borderRadius: RADIE.knapp, color: FARG.text, cursor: 'pointer', fontFamily: 'inherit', ...TYP.text, ...TNUM,
};

/** Ett värde vars bedömning syns som en prick framför (aldrig som färgad text). `ok` är tyst: ingen prick. */
export function TonVarde({ ton, children, dampadOk, style }: { ton: ToneToken; children: ReactNode; /** ok-värdet dämpat (text2) — "OK är tyst" */ dampadOk?: boolean; style?: CSSProperties }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, color: ton === 'ok' && dampadOk ? FARG.text2 : FARG.text, ...TNUM, ...style }}>
      {ton !== 'ok' && <Prick ton={ton} />}
      <span>{children}</span>
    </span>
  );
}

/** Några tal bredvid varandra i en tonad ruta: etikett över, värde under (TYP.rubrik), valfri enhet och status. */
export function TalGrid({ rubrik, celler }: { rubrik?: string; celler: { etikett: ReactNode; varde: ReactNode; enhet?: string; ton?: ToneToken }[] }) {
  return (
    <div style={{ background: FARG.tonad, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
      {rubrik && <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.m }}>{rubrik}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${celler.length}, 1fr)`, gap: AVSTAND.m }}>
        {celler.map((c, i) => (
          <div key={i} style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{c.etikett}</div>
            <div style={{ ...TYP.rubrik, ...TNUM, color: FARG.text }}>
              {c.ton && c.ton !== 'ok' && <span style={{ marginRight: AVSTAND.s, display: 'inline-flex', verticalAlign: 'middle' }}><Prick ton={c.ton} /></span>}
              {c.varde}{c.enhet && <span style={{ ...TYP.meta, color: FARG.text2 }}> {c.enhet}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** En infobox: ikon + rubrik + text, tonad yta, ingen ram. */
export function Info({ ikon, titel, children }: { ikon: string; titel: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'center', padding: AVSTAND.m, background: FARG.tonad, borderRadius: RADIE.kort }}>
      <Ikon namn={ikon} storlek={IKON.rad} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: FARG.text }}>{titel}</div>
        {children != null && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{children}</div>}
      </div>
    </div>
  );
}

/** Ett läsfel som inte stoppar vyn ("Vissa data kunde inte laddas") — ikon + rad, ovanför flikens innehåll. */
export function DelFel({ text }: { text: string }) {
  return (
    <div style={{ marginBottom: AVSTAND.l }}>
      <Info ikon="warning" titel={text} />
    </div>
  );
}
