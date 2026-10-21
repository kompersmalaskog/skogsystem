// @vitest-environment jsdom
// Kortet del 2 i RIKTIG Chromium: höjder och träffytor på telefon (390×844) och maskindatorn (1280×800, 1024×640). Pixlar går inte att mäta i jsdom, så testet renderar
// korten i jsdom och mäter HTML:en i Chromium via Playwright. Finns ingen Chromium hoppas mätningen över (det står i testnamnet). MALBILD_HYTT_SKRIV=1 skriver ut höjderna.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KartKort, KartKortNederst, KortAtgarder, KortKnapp } from './KartKort';
import { TraktAnalysRad, type Kontroll } from './TraktAnalysRad';
import { BasvagFargVal } from './BasvagFargVal';
import { BackvagVal } from './BackvagVal';
import { MalbildRad } from '@/components/malbild/Malbild';
import { FARG } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SKARMAR = [{ w: 390, h: 844 }, { w: 1280, h: 800 }, { w: 1024, h: 640 }];
const MINDRE = [{ w: 375, h: 667 }, { w: 360, h: 740 }];

function chromium(): { launch: (o: object) => Promise<any> } | null {
  try {
    const rot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const kor = createRequire(path.join(rot, 'x.js'));
    const pw = kor('playwright');
    const mapp = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const ver = fs.readdirSync(mapp).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
    const exe = ver && path.join(mapp, ver, 'chrome-linux', 'chrome');
    if (!exe || !fs.existsSync(exe)) return null;
    return { launch: (o) => pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'], ...o }) };
  } catch { return null; }
}
const CHROMIUM = chromium();

function renderaHtml(el: React.ReactElement, efter?: () => void): string {
  document.body.innerHTML = '';
  const c = document.createElement('div'); document.body.appendChild(c);
  const r = createRoot(c);
  act(() => { r.render(el); });
  if (efter) efter();
  const h = document.body.innerHTML;
  act(() => { r.unmount(); });
  return h;
}

const sju = (over: Record<number, Partial<Kontroll>> = {}): Kontroll[] => ['Vatten', 'Reservat', 'Natura 2000', 'Fornlämning', 'Nyckelbiotop', 'Biotopskydd', 'Skog & historia']
  .map((label, i) => ({ type: 't' + i, label, lage: 'ingen' as const, traffar: [], ...(over[i] ?? {}) }));
const egen = (id: string, text: string) => ({ id, text, forfattare: 'Martin · i går 16:20', vantar: false, kanAndra: true, kanRadera: true });
const noop = () => {};

/** Linjekortet (Basväg): egen kommentar på en rad, färgval, backväg, och de fyra knapparna längst ner. */
const linjekort = () => (
  <KartKort ikon={<div style={{ width: 52, height: 52 }} />} namn="Basväg" grupp="info" larmRegel="Larmar inte" mening="Basväg – huvudväg för skogsmaskinerna."
    kommentarer={[egen('1', 'Backa ut, vändplats saknas i norr')]} kanKommentera onLaggKommentar={noop} onAndraKommentar={noop} onRaderaKommentar={noop} foton={[]} onLaggTillFoto={noop}
    rost={{ onToggle: noop, spelar: false, sekunder: 0 }} onStang={noop}>
    <div style={{ fontSize: 15, color: '#8e8e93', textAlign: 'center' }}>Basväg 3 · 640 m</div>
    <BasvagFargVal valt="blagul" onVal={noop} />
    <BackvagVal backvag={null} onAndra={noop} />
    <KartKortNederst>
      <KortAtgarder>
        <KortKnapp text="Förläng" onClick={noop} /><KortKnapp text="Markera RISA-del" onClick={noop} /><KortKnapp text="Numrera om basvägar" onClick={noop} /><KortKnapp text="Ta bort" destruktiv onClick={noop} />
      </KortAtgarder>
    </KartKortNederst>
  </KartKort>
);

/** Vidas hänsynsyta, med flit ett tungt fall: Vidas text (två punkter) + en egen kommentar (två punkter), målbild, åtgärdsrad, traktanalysen på EN rad och planeringsknapparna (inte i maskinläget). Får scrolla lite på en smal telefon; höjderna skrivs ut. */
const ytakort = (planering: boolean, kontroller: Kontroll[]) => (
  <KartKort ikon={<div style={{ width: 52, height: 52 }} />} namn="Hänsynsyta 3" grupp="natur" larmRegel="Larmar alltid" mening="Hänsynsyta – lämnas orörd."
    kalla="Vida · Övrigt · 0,8 ha" vidaKommentar={'avverkning av frötallar.\r\nLämn kantzon mot sjön. Lämna enstaka utspridda tallar.'}
    kommentarer={[egen('1', 'Husruin i nordöstra delen\nKör inte över stenmuren')]} kanKommentera onLaggKommentar={noop} onAndraKommentar={noop} onRaderaKommentar={noop} foton={[]} onLaggTillFoto={noop}
    rost={{ onToggle: noop, spelar: false, sekunder: 0 }} onStang={noop} malbild={<MalbildRad nyckel="hansyn" roll="skordare" />}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 12, borderTop: `1px solid ${FARG.linje}` }}>
      <TraktAnalysRad status="klar" kontroller={kontroller} />
      {planering && (<KortAtgarder><KortKnapp text="Beräkna volym" onClick={noop} /><KortKnapp text="Justera gräns" onClick={noop} /></KortAtgarder>)}
    </div>
  </KartKort>
);

const FALL: { namn: string; html: () => string; kravUtanScroll: boolean }[] = [
  { namn: 'linjekort (Basväg)', html: () => renderaHtml(linjekort()), kravUtanScroll: true },
  { namn: 'yta, maskinläge, inget hittat', html: () => renderaHtml(ytakort(false, sju())), kravUtanScroll: false },
  { namn: 'yta, planeringsläge, inget hittat', html: () => renderaHtml(ytakort(true, sju())), kravUtanScroll: false },
  { namn: 'yta, planeringsläge, tre träffar', html: () => renderaHtml(ytakort(true, sju({ 3: { lage: 'traff', traffar: [{ name: 'Husgrund', details: 'RAÄ 12' }, { name: 'Röse' }] }, 4: { lage: 'traff', traffar: [{ name: 'Källkant' }] } }))), kravUtanScroll: false },
];

describe(`Kortet del 2 — mått i ${CHROMIUM ? 'Chromium' : 'HOPPAD ÖVER: ingen Chromium i miljön'}`, () => {
  const sidaHtml = (html: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:${FARG.bg};color:#fff;font-family:system-ui,sans-serif}.material-symbols-outlined{display:inline-block;width:22px;height:22px;font-size:0;overflow:hidden}</style></head><body>${html}</body></html>`;

  it.skipIf(!CHROMIUM)('höjder, träffytor (≥ 44 px), ingen sidscroll och kommentarerna överst — på telefon och maskindatorn', async () => {
    const b = await CHROMIUM!.launch({});
    const rader: string[] = [];
    try {
      for (const s of [...SKARMAR, ...MINDRE]) {
        const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
        for (const f of FALL) {
          await p.setContent(sidaHtml(f.html()));
          const m = await p.evaluate(() => {
            const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
            const ark = document.querySelector('[data-testid="kartkort"]>div, [data-testid="trakt-kort"]>div, [data-testid="marker-kort"]>div, [data-testid^="kartkort"]>div') as HTMLElement | null
              ?? (document.querySelector('[data-grupp]>div') as HTMLElement | null);
            const rulle = ark ? (Array.from(ark.children).find((c) => getComputedStyle(c as HTMLElement).overflowY === 'auto') as HTMLElement | undefined) : undefined;
            const hojdMin = (sel: string) => { const l = Array.from(document.querySelectorAll(sel)) as HTMLElement[]; return l.length ? Math.round(Math.min(...l.map((e) => e.getBoundingClientRect().height))) : null; };
            const komm = q('kartkort-kommentar'), mening = q('kartkort-mening'), xk = q('kartkort-stang');
            const mer = q('kartkort-kommentar-mer'), rad = q('traktanalys-rad');
            const knappar = Array.from(document.querySelectorAll('[data-testid="kartkort-kortatgarder"] button')) as HTMLElement[];
            return {
              ok: !!ark && !!rulle, kortH: ark ? Math.round(ark.getBoundingClientRect().height) : 0, skroll: rulle ? rulle.scrollHeight - rulle.clientHeight : 0,
              sidled: rulle ? rulle.scrollWidth - rulle.clientWidth : 0,
              kommentarFore: !!komm && !!mening && komm.getBoundingClientRect().top < mening.getBoundingClientRect().top,
              kommentarTopp: komm ? Math.round(komm.getBoundingClientRect().top - (xk ? xk.getBoundingClientRect().bottom : 0)) : null,
              merH: mer ? Math.round(mer.getBoundingClientRect().height) : null, merB: mer ? Math.round(mer.getBoundingClientRect().width) : null,
              analysH: rad ? Math.round(rad.getBoundingClientRect().height) : null,
              knappH: knappar.length ? Math.round(Math.min(...knappar.map((k) => k.getBoundingClientRect().height))) : null, antalKnappar: knappar.length,
              siffraH: hojdMin('[data-testid="kartkort-kommentar-siffra"]'),
              textPx: (() => { const e = q('kartkort-kommentar-text'); return e ? getComputedStyle(e).fontSize : null; })(),
            };
          });
          expect(m.ok, `${f.namn} ${s.w}×${s.h}: kortet hittades inte`).toBe(true);
          expect(m.kommentarFore, `${f.namn}: kommentaren ska stå före meningen`).toBe(true);
          expect(m.sidled, `${f.namn} ${s.w}×${s.h}: innehållet går utanför bredden`).toBeLessThanOrEqual(0);
          if (m.merH != null) { expect(m.merH, `${f.namn}: ··· under 44 px`).toBeGreaterThanOrEqual(44); expect(m.merB!, `${f.namn}: ··· under 44 px bred`).toBeGreaterThanOrEqual(44); }
          if (m.analysH != null) expect(m.analysH, `${f.namn}: traktanalysraden under 44 px`).toBeGreaterThanOrEqual(44);
          if (m.knappH != null) expect(m.knappH, `${f.namn}: kortknapp under 44 px`).toBeGreaterThanOrEqual(44);
          expect(m.textPx, `${f.namn}: kommentartexten ska vara 19 px`).toBe('19px');
          if (s.w === 390 && f.kravUtanScroll) expect(m.skroll, `${f.namn} 390×844: kortet scrollar (${m.skroll} px)`).toBe(0);
          rader.push(`${String(s.w + '×' + s.h).padEnd(9)} ${f.namn.padEnd(36)} kort ${String(m.kortH).padStart(3)} px  skroll ${String(m.skroll).padStart(3)}  ···${m.merH ?? '-'}  analys ${m.analysH ?? '-'}  knapp ${m.knappH ?? '-'}(${m.antalKnappar})`);
        }
        await p.close();
      }
    } finally { await b.close(); }
    if (process.env.MALBILD_HYTT_SKRIV) console.log('\n' + rader.join('\n'));
  }, 120000);
});
