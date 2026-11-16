'use client';

// KORTET NÄR MAN TRYCKER PÅ EN HÖG (Martin 2026-11-06, design A: "så lätt att ett barn förstår direkt").
// Överst hur mycket som ligger kvar, under det vad det mest är, en stapel med fördelningen och en rad per
// sortiment med siffran till höger. Tre lika stora knappar: Stäng · Tagen (vit) · Ligger kvar.
// Färgerna är appens sortimentfärger (SORTIMENTFARG, samma som maskinvyn och markägarrapporten); färgen bär
// aldrig ensam — namnet och talet står alltid bredvid. Ligger på samma plats som listen nertill (KorvyNertillList).

import React from 'react';
import { AVSTAND, FARG, RADIE, SORTIMENTFARG, TYP, medSafeBotten } from '@/lib/design/tokens';
import type { HogGrupp, HogGruppKvar } from '@/lib/skotarHogarKvar';

const KNAPP_HOJD_PX = 52;
const PLUS_ZON_PX = 72;
const PLUS_OVER_PX = 20 + 44 + AVSTAND.s;
const STAPEL_HOJD_PX = 14;
const STAPEL_GLIPA_PX = 2;
/** En vit knapp med längre text än så här får en egen rad överst (Tagen ryms bredvid de andra, Allt är taget gör det inte på telefon). */
const LANG_ETIKETT = 11;

export const HOG_GRUPP_FARG: Record<HogGrupp, string> = {
  timmer: SORTIMENTFARG.timmer,
  kubb: SORTIMENTFARG.kubb,
  massa: SORTIMENTFARG.massa,
  energi: SORTIMENTFARG.ovrigt,
  ovrigt: SORTIMENTFARG.ovrigt,
};

export function m3Text(v: number): string {
  return v.toFixed(1).replace('.', ',');
}

/** "Mest massaved" — bara när högen har mer än ett sortiment. */
export function mestText(grupper: HogGruppKvar[]): string | null {
  if (grupper.length < 2) return null;
  return `Mest ${grupper[0].namn.toLowerCase()}`;
}

/** Sortimenten som går att markera för sig (tabellens grupp): Övrigt har ingen egen markering, det följer med "Allt". */
export const BOCKBARA: readonly HogGrupp[] = ['timmer', 'kubb', 'massa', 'energi'];

/** Den vita knappen i områdeskortet: "Allt är taget" / "Timmer är taget" / "Timmer och kubb är taget" / "Timmer, kubb och massaved är taget". */
export function tagenEtikett(valda: readonly HogGruppKvar[]): string {
  if (!valda.length) return 'Allt är taget';
  const n = valda.map((g, i) => (i === 0 ? g.namn : g.namn.toLowerCase()));
  const lista = n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} och ${n[n.length - 1]}`;
  return `${lista} är taget`;
}

export interface HogKortKnapp { etikett: string; testid: string; onClick: () => void; av?: boolean }

export function HogKort({ titel, under, grupper, decimaler = 1, val, smal, testid = 'hog-kort', knappar }: {
  titel: string;
  /** Raden under titeln; utan den står "Mest …" när högen har fler sortiment. */
  under?: string | null;
  /** Sortimenten, störst först. Saknas när ett enda sortiment visas (då står bara titeln). */
  grupper?: HogGruppKvar[];
  decimaler?: number;
  /** Bocka i sortiment (områdeskortet): raderna med ett sortiment som går att markera blir knappar med en ring. */
  val?: { valda: ReadonlySet<HogGrupp>; onVal: (g: HogGrupp) => void };
  smal: boolean;
  testid?: string;
  /** Tre lika stora knappar; den mittersta är den vita. */
  knappar: [HogKortKnapp, HogKortKnapp, HogKortKnapp];
}) {
  const g = grupper && grupper.length > 0 ? grupper : null;
  const underText = under !== undefined ? under : g ? mestText(g) : null;
  const fmt = (v: number) => v.toFixed(decimaler).replace('.', ',');
  const knapp = (k: HogKortKnapp, primar: boolean) => (
    <button key={k.testid} type="button" data-testid={k.testid} onClick={k.onClick} disabled={k.av} className="press-dim"
      style={{ flex: '1 1 0', minWidth: 0, height: KNAPP_HOJD_PX, padding: `0 ${AVSTAND.s}px`, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', ...TYP.listtitel,
        cursor: k.av ? 'default' : 'pointer', opacity: k.av ? 0.4 : 1, background: primar ? FARG.text : FARG.fyllning, color: primar ? FARG.bg : FARG.text }}>
      {k.etikett}
    </button>
  );
  return (
    <div data-testid={testid}
      style={{
        position: 'fixed', left: AVSTAND.s, right: smal ? AVSTAND.s : PLUS_ZON_PX, zIndex: 600, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        bottom: smal ? `calc(${PLUS_OVER_PX}px + env(safe-area-inset-bottom, 0px))` : medSafeBotten(AVSTAND.l + AVSTAND.xs),
      }}>
      <div role="status"
        style={{
          pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: AVSTAND.m, width: '100%', maxWidth: 560, boxSizing: 'border-box',
          padding: AVSTAND.l, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, fontFamily: 'inherit',
        }}>
        <div>
          <div data-testid={`${testid}-titel`} style={{ ...TYP.titel }}>{titel}</div>
          {underText && <div data-testid={`${testid}-mest`} style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{underText}</div>}
        </div>
        {g && (
          <>
            <div data-testid={`${testid}-stapel`} aria-hidden="true" style={{ display: 'flex', gap: STAPEL_GLIPA_PX, height: STAPEL_HOJD_PX, borderRadius: STAPEL_HOJD_PX / 2, overflow: 'hidden' }}>
              {g.map((r) => (
                <div key={r.grupp} style={{ flex: `${Math.max(r.m3, 0.01)} 1 0`, background: HOG_GRUPP_FARG[r.grupp],
                  boxShadow: r.grupp === 'timmer' ? `inset 0 0 0 1px ${FARG.linje}` : undefined }} />
              ))}
            </div>
            <div data-testid={`${testid}-innehall`} style={{ display: 'flex', flexDirection: 'column' }}>
              {g.map((r, i) => {
                const bockbar = !!val && BOCKBARA.includes(r.grupp);
                const vald = bockbar && val!.valda.has(r.grupp);
                const innehall = (
                  <>
                    {val && (
                      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: RADIE.cirkel, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: bockbar ? `2px solid ${vald ? FARG.text : FARG.text3}` : 'none', background: vald ? FARG.text : 'transparent', color: FARG.bg, ...TYP.meta, fontWeight: 700 }}>
                        {vald ? '✓' : ''}
                      </span>
                    )}
                    <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: RADIE.stapel, flexShrink: 0, background: HOG_GRUPP_FARG[r.grupp], boxShadow: `inset 0 0 0 1px ${FARG.linje}` }} />
                    <span style={{ ...TYP.text, flex: 1, minWidth: 0, textAlign: 'left' }}>{r.namn}</span>
                    <span style={{ ...TYP.text, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.m3)} m³</span>
                  </>
                );
                const stil: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 48, width: '100%', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text };
                return bockbar ? (
                  <button key={r.grupp} type="button" data-testid={`${testid}-rad-${r.grupp}`} aria-pressed={vald} onClick={() => val!.onVal(r.grupp)} className="press-dim"
                    style={{ ...stil, padding: 0, border: 'none', borderTopStyle: i === 0 ? 'none' : 'solid', borderTopWidth: i === 0 ? 0 : 1, borderTopColor: FARG.linje, background: 'transparent', fontFamily: 'inherit', cursor: 'pointer' }}>
                    {innehall}
                  </button>
                ) : (
                  <div key={r.grupp} data-testid={`${testid}-rad-${r.grupp}`} style={stil}>{innehall}</div>
                );
              })}
            </div>
          </>
        )}
        {/* En lång vit knapp ("Timmer och kubb är taget") får en egen rad överst i stället för att brytas i två rader. */}
        {knappar[1].etikett.length > LANG_ETIKETT ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            <div style={{ display: 'flex' }}>{knapp(knappar[1], true)}</div>
            <div style={{ display: 'flex', gap: AVSTAND.s }}>{knapp(knappar[0], false)}{knapp(knappar[2], false)}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: AVSTAND.s }}>
            {knapp(knappar[0], false)}
            {knapp(knappar[1], true)}
            {knapp(knappar[2], false)}
          </div>
        )}
      </div>
    </div>
  );
}
