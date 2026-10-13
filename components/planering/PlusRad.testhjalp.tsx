// Testhjälp för PlusRad/PlusArk (jsdom): fönsterbredd, matchMedia, en Vård som beter sig som sidan (verktyg/× stänger → oppen=false) och en
// fast uppsättning poster. Används av PlusRad.panel.test.tsx — och var det som genererade golden-filerna ur main (före panelen) så att
// "under 900 px oförändrat" jämförs mot main, inte mot en beskrivning av den.
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import type { ComponentType } from 'react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

export function sattBredd(px: number) {
  (window as any).innerWidth = px;
  (window as any).matchMedia = (q: string) => {
    const m = /min-width:\s*(\d+)px/.exec(q);
    return { matches: m ? px >= Number(m[1]) : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false };
  };
}

export type Spion = { post: string[]; stang: number; rita: string[] };

const post = (nyckel: string, etikett: string, farg: string) => ({ nyckel, etikett, ikon: null, fast: false, fastbar: true, dockFarg: farg, dockGlyf: null });

export function Vard({ Komp, start, spion }: { Komp: ComponentType<any>; start?: string | null; spion: Spion }) {
  const [oppen, setOppen] = useState(true);
  const poster = [post('symbol:wet', 'Fuktig mark', '#2a7a4b'), post('symbol:steep', 'Brant', '#a33'), post('symbol:culturemonument', 'Kulturminne', '#c80')];
  const ark = {
    symboler: [{ id: 'Fara', rubrik: 'Fara', poster }],
    rita: [
      { id: 'linje', titel: 'Rita linje', ikon: 'linje', onTryck: () => { spion.rita.push('linje'); setOppen(false); } },
      { id: 'strackan', titel: 'Mät sträcka', ikon: 'strackan', onTryck: () => { spion.rita.push('strackan'); setOppen(false); } },
    ],
    lager: [{ id: 'bakgrund', rubrik: 'Bakgrundskarta', rader: [{ id: 'lm', namn: 'Karta', typ: 'val', pa: true, onTryck: () => {} }] }],
  };
  return (
    <Komp
      oppen={oppen}
      poster={poster}
      ark={ark}
      startFlik={start ?? null}
      onPost={(n: string) => { spion.post.push(n); setOppen(false); }}
      onFastna={() => ({ ok: true, text: 'Fast' })}
      onSparaDocka={() => {}}
      onAterstall={() => {}}
      onStang={() => { spion.stang += 1; setOppen(false); }}
    />
  );
}

export type Monterad = { rot: Root; behallare: HTMLElement; spion: Spion; html: () => string; avmontera: () => void };

export function montera(Komp: ComponentType<any>, start?: string | null): Monterad {
  const behallare = document.createElement('div');
  document.body.appendChild(behallare);
  const spion: Spion = { post: [], stang: 0, rita: [] };
  const rot = createRoot(behallare);
  act(() => { rot.render(<Vard Komp={Komp} start={start} spion={spion} />); });
  return { rot, behallare, spion, html: () => behallare.innerHTML, avmontera: () => { act(() => rot.unmount()); behallare.remove(); } };
}

/** Rendera, låt bildrutan efter monteringen passera (dockans/panelens in-animation, `avancera` = fake-timers) och ge HTML:en. */
export function renderaHtml(Komp: ComponentType<any>, start: string | null | undefined, avancera: (ms: number) => void): string {
  const m = montera(Komp, start);
  act(() => { avancera(1000); });
  const h = m.html();
  m.avmontera();
  return h;
}
