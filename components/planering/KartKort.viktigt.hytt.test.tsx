// @vitest-environment jsdom
// VIKTIGT-RADEN PÅ KORTEN I RIKTIG CHROMIUM (Martin 2026-11-23): kartkortet (planeringsvyn) och instruktionskortet (maskinen vid inkörning) — Viktigt-raden överst, orange och fet,
// Övrigt under, skrivformuläret med två fält, träffytor ≥ 44 px, ingen sidscroll. Pixlar och höjder går inte att mäta i jsdom: korten renderas i jsdom och HTML:en mäts i Chromium.
// VIKTIGT_SKRIV=<mapp> sparar skärmbilderna (ikonen "warning" ritas där som ⚠, eftersom Material Symbols inte laddas i testet). Ingen Chromium → hoppas över.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KartKort } from './KartKort';
import { InstruktionKortVy } from './InstruktionKort';
import { FARG, FONT } from '@/lib/design/tokens';
import { hittaChromium } from '../../lib/testStod/chromium';
import type { Instruktion, InstruktionKortData } from '@/lib/instruktioner/instruktioner';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const CHROMIUM = hittaChromium();
const SKRIV = process.env.VIKTIGT_SKRIV;
const noop = () => {};

function html(el: React.ReactElement): string {
  document.body.innerHTML = '';
  const c = document.createElement('div'); document.body.appendChild(c);
  const r = createRoot(c);
  act(() => { r.render(el); });
  const h = document.body.innerHTML;
  act(() => { r.unmount(); });
  return h;
}
const sida = (h: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:${FARG.bg};color:#fff;font-family:${FONT}}.material-symbols-outlined{display:inline-block;width:22px;height:22px;font-size:0;overflow:hidden}</style></head><body>${h}</body></html>`;


/** Material Symbols laddas inte i testet: ikonerna ritas som tecken så skärmbilderna går att läsa (⚠ är Viktigt-ikonen). */
const rensaIkoner = (p: any) => p.evaluate(() => {
  const tecken: Record<string, string> = { warning: '⚠', close: '✕', more_horiz: '···', add_comment: '＋', photo_camera: '▣', mic: '●' };
  document.querySelectorAll('.material-symbols-outlined').forEach((e) => {
    const el = e as HTMLElement; const t = tecken[el.textContent ?? ''];
    if (t) { el.style.fontSize = '20px'; el.style.width = 'auto'; el.style.lineHeight = '1'; el.textContent = t; } else el.style.display = 'none';
  });
});

const hansynKort = (skriver: boolean) => (
  <KartKort ikon={<div style={{ width: 52, height: 52, borderRadius: '50%', background: '#30d158' }} />} namn="Hänsyn 1" grupp="natur" larmRegel="Larmar alltid" mening="Hänsynsyta – lämnas orörd." kalla="Vida · Kant mot vatten"
    vidaKommentar="Lämna kantzon mot sjön." kanViktigt kanKommentera onLaggKommentar={noop} onAndraKommentar={noop} onRaderaKommentar={noop} foton={[]} onLaggTillFoto={noop} onStang={noop}
    kommentarer={[
      { id: 'a', text: 'Gammal kommentar från i våras', viktigt: null, forfattare: 'Daniel · 3 maj 16:20', vantar: false, kanAndra: false, kanRadera: false },
      { id: 'b', text: 'Bron håller inte för skördaren.\nKör runt via basväg 2.', viktigt: 'Kör inte över bäcken – bron brister', forfattare: 'Martin · idag 08:10', vantar: false, kanAndra: true, kanRadera: true },
    ]} />
);

const egen: Instruktion = { ref: 'k1', text: 'Stanna vid stenen\nGå runt\nLämna ris', hash: 'b', kalla: 'egen', forfattare: 'Martin · i går 16:20', vantar: false };
const viktig: Instruktion = { ref: 'k2', text: 'Bron håller inte för skördaren.', viktigt: 'Kör inte över bäcken – bron brister', hash: 'v', kalla: 'egen', forfattare: 'Martin · idag 08:10', vantar: false };
const instrKort: InstruktionKortData = { nyckel: 'hansyn:1', namn: 'Hänsyn 1 · Kant mot vatten', avlagg: false, instruktioner: [viktig, egen], fler: 0 } as any;

describe(`Viktigt på korten — mått i ${CHROMIUM ? 'Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  it.skipIf(!CHROMIUM)('Viktigt-raden överst, orange och fet, ingen sidscroll och träffytor ≥ 44 px — kartkortet, skrivformuläret och instruktionskortet, på telefon och maskindator', async () => {
    const b = await CHROMIUM!.launch({});
    if (SKRIV) mkdirSync(SKRIV, { recursive: true });
    try {
      for (const s of [{ w: 390, h: 844 }, { w: 360, h: 740 }, { w: 1280, h: 800 }]) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        const fall: { namn: string; h: string }[] = [
          { namn: 'kartkort', h: html(hansynKort(false)) },
          { namn: 'instruktionskort', h: html(<InstruktionKortVy kort={instrKort} top="12px" onSett={noop} />) },
        ];
        for (const f of fall) {
          await p.setContent(sida(f.h));
          await rensaIkoner(p);
          const m = await p.evaluate(() => {
            const rad = document.querySelector('[data-testid="viktigt-rad"]') as HTMLElement | null;
            const text = document.querySelector('[data-testid="viktigt-text"]') as HTMLElement | null;
            const ovrigt = document.querySelector('[data-testid="viktigt-rad"]')?.closest('[data-testid="kartkort-kommentar-rad"], [data-testid="instruktion-ruta"]')?.querySelector('[data-testid="kartkort-kommentar-text"]') as HTMLElement | null;
            const alla = Array.from(document.querySelectorAll('[data-testid="kartkort-kommentar-rad"], [data-testid="kartkort-kommentar-vida"], [data-testid="instruktion-ruta"]')) as HTMLElement[];
            const forst = alla.sort((a, c) => a.getBoundingClientRect().top - c.getBoundingClientRect().top)[0];
            return {
              finns: !!rad, farg: rad ? getComputedStyle(rad).color : null, vikt: text ? getComputedStyle(text).fontWeight : null, storlek: text ? parseFloat(getComputedStyle(text).fontSize) : 0,
              underOvrigt: !!(rad && ovrigt && rad.getBoundingClientRect().bottom <= ovrigt.getBoundingClientRect().top + 1),
              ovrigtFarg: ovrigt ? getComputedStyle(ovrigt).color : null,
              viktigtForst: !!(forst && rad && forst.contains(rad)),
              sidled: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              kantHoger: rad ? Math.round(document.documentElement.clientWidth - rad.getBoundingClientRect().right) : 0,
            };
          });
          expect(m.finns, `${f.namn} ${s.w}: Viktigt-raden finns`).toBe(true);
          expect(m.farg, `${f.namn} ${s.w}: orange`).toBe('rgb(255, 159, 10)');
          expect(Number(m.vikt), `${f.namn} ${s.w}: fet`).toBeGreaterThanOrEqual(700);
          expect(m.storlek, `${f.namn} ${s.w}: större än brödtexten (19 px)`).toBeGreaterThanOrEqual(20);
          expect(m.underOvrigt, `${f.namn} ${s.w}: Övrigt står under Viktigt`).toBe(true);
          expect(m.ovrigtFarg, `${f.namn} ${s.w}: Övrigt är vanlig text, inte orange`).not.toBe('rgb(255, 159, 10)');
          expect(m.viktigtForst, `${f.namn} ${s.w}: den översta kommentarsrutan bär Viktigt`).toBe(true);
          expect(m.sidled, `${f.namn} ${s.w}: sidscroll`).toBeLessThanOrEqual(0);
          expect(m.kantHoger, `${f.namn} ${s.w}: raden går inte utanför kortet`).toBeGreaterThanOrEqual(0);
          if (SKRIV) await p.screenshot({ path: path.join(SKRIV, `${f.namn}-${s.w}x${s.h}.png`) });
        }
        await p.close();
      }
    } finally { await b.close(); }
  }, 120000);

  it.skipIf(!CHROMIUM)('skrivformuläret: Viktigt (en rad, 60 tecken) och Övrigt, fälten och Spara ≥ 44 px, ingen sidscroll', async () => {
    const b = await CHROMIUM!.launch({});
    try {
      for (const s of [{ w: 390, h: 844 }, { w: 360, h: 740 }, { w: 1280, h: 800 }]) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        // Formuläret renderas öppet (knappen trycks i jsdom) och HTML:en mäts i Chromium.
        const formHtml = (() => {
          document.body.innerHTML = '';
          const c = document.createElement('div'); document.body.appendChild(c);
          const r = createRoot(c);
          act(() => { r.render(hansynKort(true)); });
          act(() => { (document.querySelector('[data-testid="kartkort-kommentar-ny"]') as HTMLElement).click(); });
          const h = document.body.innerHTML;
          act(() => { r.unmount(); });
          return h;
        })();
        await p.setContent(sida(formHtml));
        await rensaIkoner(p);
        const m = await p.evaluate(() => {
          const v = document.querySelector('[data-testid="kartkort-kommentar-viktigt"]') as HTMLInputElement;
          const o = document.querySelector('[data-testid="kartkort-kommentar-falt"]') as HTMLTextAreaElement;
          const sp = document.querySelector('[data-testid="kartkort-kommentar-spara"]') as HTMLElement;
          const h = (e: HTMLElement) => Math.round(e.getBoundingClientRect().height);
          return { vH: h(v), oH: h(o), spH: h(sp), maxLen: v.maxLength, viktigtForeOvrigt: v.getBoundingClientRect().top < o.getBoundingClientRect().top, sidled: document.documentElement.scrollWidth - document.documentElement.clientWidth, vB: Math.round(v.getBoundingClientRect().width), kortB: document.documentElement.clientWidth };
        });
        expect(m.vH, `${s.w}: Viktigt-fältet`).toBeGreaterThanOrEqual(44);
        expect(m.spH, `${s.w}: Spara`).toBeGreaterThanOrEqual(44);
        expect(m.oH, `${s.w}: Övrigt`).toBeGreaterThanOrEqual(44);
        expect(m.maxLen).toBe(60);
        expect(m.viktigtForeOvrigt).toBe(true);
        expect(m.sidled, `${s.w}: sidscroll`).toBeLessThanOrEqual(0);
        expect(m.vB, `${s.w}: fältet är inte bredare än skärmen`).toBeLessThanOrEqual(m.kortB);
        if (SKRIV) await p.screenshot({ path: path.join(SKRIV, `formular-${s.w}x${s.h}.png`) });
        await p.close();
      }
    } finally { await b.close(); }
  }, 120000);
});
